"""
LSTM Network — SECONDARY medium-horizon model
PRD Section 6.2 | Literature Review Section 4.1

Architecture:
  - 2-layer LSTM, hidden_size=128, dropout=0.25
  - Dense(1, sigmoid) output
  - Input: Rolling 30-day window of features_daily
  - Target: Binary — log_return_20d > 0

CRITICAL CONSTRAINTS (from Literature Review):
  - Predict LOG RETURNS ONLY. Never predict raw price.
  - Expanding-window normalization. StandardScaler on train window ONLY.
  - Dropout 0.25 + L2 weight decay 1e-4 (NSE data insufficient for unregularized LSTM)
  - Must beat ARIMA baseline on 20-day horizon. If not, ARIMA is used instead.
  - Library: PyTorch (not TensorFlow)

Literature Review findings:
  - Mehtab & Sen (IIT, 2020): ARIMA beat LSTM for 1-day prediction on Nifty 50
  - LSTM advantage ONLY at 15-30 day horizons with non-price features
  - Overfitting is primary failure mode with 2+ layers and >100 hidden units
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

from backend.core.logging_config import get_logger
from backend.models.xgboost_model import FEATURE_COLUMNS

logger = get_logger(__name__)

SEQUENCE_LENGTH = 30  # 30-day rolling window
TARGET_COL = "target_20d"  # Binary: log_return_20d > 0


# ═══════════════════════════════════════════════════════════════
# Dataset
# ═══════════════════════════════════════════════════════════════

class StockSequenceDataset(Dataset):
    """
    Create sequences of SEQUENCE_LENGTH days for LSTM input.
    Each sample: (30-day feature window, binary target).
    """

    def __init__(self, features: np.ndarray, targets: np.ndarray, seq_length: int = SEQUENCE_LENGTH):
        self.seq_length = seq_length
        self.features = features
        self.targets = targets
        self.n_samples = len(features) - seq_length

    def __len__(self) -> int:
        return max(0, self.n_samples)

    def __getitem__(self, idx: int):
        X = self.features[idx: idx + self.seq_length]
        y = self.targets[idx + self.seq_length]
        return torch.FloatTensor(X), torch.FloatTensor([y])


# ═══════════════════════════════════════════════════════════════
# Model Architecture
# ═══════════════════════════════════════════════════════════════

class LSTMPredictor(nn.Module):
    """
    PRD Section 6.2:
      - 2-layer LSTM
      - hidden_size=128
      - dropout=0.25
      - Dense(1, sigmoid)
    """

    def __init__(
        self,
        input_size: int = len(FEATURE_COLUMNS),
        hidden_size: int = 128,
        num_layers: int = 2,
        dropout: float = 0.25,
    ):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0,
            batch_first=True,
        )

        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: (batch, seq_length, input_size)
        lstm_out, (h_n, c_n) = self.lstm(x)

        # Use the last hidden state
        last_hidden = h_n[-1]  # Shape: (batch, hidden_size)
        out = self.dropout(last_hidden)
        out = self.fc(out)
        out = self.sigmoid(out)
        return out


# ═══════════════════════════════════════════════════════════════
# Training and Inference
# ═══════════════════════════════════════════════════════════════

class LSTMModel:
    """
    Wrapper for LSTM training, inference, and model management.
    PRD Section 6.2: Retraining frequency = monthly.
    """

    def __init__(self, device: str | None = None):
        if device:
            self.device = torch.device(device)
        else:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model: LSTMPredictor | None = None
        self.scaler_mean: np.ndarray | None = None
        self.scaler_std: np.ndarray | None = None
        self.model_version: str | None = None

    def _normalize(self, X: np.ndarray, fit: bool = False) -> np.ndarray:
        """
        StandardScaler — fitted on training data ONLY.
        PRD Section 15.2: Scaler fitted on train window only, NEVER on full dataset.
        """
        if fit:
            self.scaler_mean = np.nanmean(X, axis=0)
            self.scaler_std = np.nanstd(X, axis=0)
            self.scaler_std[self.scaler_std == 0] = 1.0  # Avoid division by zero

        X_norm = (X - self.scaler_mean) / self.scaler_std
        # Replace NaN with 0 after normalization (LightGBM handles missing, LSTM needs values)
        X_norm = np.nan_to_num(X_norm, nan=0.0)
        return X_norm

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None,
        epochs: int = 100,
        batch_size: int = 64,
        learning_rate: float = 1e-3,
        weight_decay: float = 1e-4,  # PRD: L2 regularization required
        patience: int = 15,
    ) -> dict:
        """
        Train LSTM with early stopping.

        PRD Section 6.2:
          - L2 weight decay 1e-4 (required for NSE data)
          - Walk-forward validation (handled by training/walk_forward.py)
          - Must beat ARIMA baseline
        """
        # Prepare features
        features = X_train[FEATURE_COLUMNS].values.astype(np.float32)
        targets = y_train.values.astype(np.float32)

        # Normalize (fit on training data ONLY)
        features = self._normalize(features, fit=True)

        # Create dataset and dataloader
        dataset = StockSequenceDataset(features, targets, SEQUENCE_LENGTH)
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=False)  # No shuffle for time series!

        # Validation set
        val_loader = None
        if X_val is not None and y_val is not None:
            val_features = self._normalize(X_val[FEATURE_COLUMNS].values.astype(np.float32))
            val_targets = y_val.values.astype(np.float32)
            val_dataset = StockSequenceDataset(val_features, val_targets, SEQUENCE_LENGTH)
            val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

        # Initialize model
        input_size = len(FEATURE_COLUMNS)
        self.model = LSTMPredictor(input_size=input_size).to(self.device)

        criterion = nn.BCELoss()
        optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=learning_rate,
            weight_decay=weight_decay,  # L2 regularization
        )

        # Training loop with early stopping
        best_val_loss = float("inf")
        patience_counter = 0
        best_state = None
        history = {"train_loss": [], "val_loss": []}

        for epoch in range(epochs):
            # Training
            self.model.train()
            train_losses = []
            for X_batch, y_batch in dataloader:
                X_batch = X_batch.to(self.device)
                y_batch = y_batch.to(self.device)

                optimizer.zero_grad()
                output = self.model(X_batch)
                loss = criterion(output, y_batch)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                optimizer.step()
                train_losses.append(loss.item())

            avg_train_loss = np.mean(train_losses)
            history["train_loss"].append(avg_train_loss)

            # Validation
            if val_loader:
                self.model.eval()
                val_losses = []
                with torch.no_grad():
                    for X_batch, y_batch in val_loader:
                        X_batch = X_batch.to(self.device)
                        y_batch = y_batch.to(self.device)
                        output = self.model(X_batch)
                        loss = criterion(output, y_batch)
                        val_losses.append(loss.item())

                avg_val_loss = np.mean(val_losses)
                history["val_loss"].append(avg_val_loss)

                # Early stopping
                if avg_val_loss < best_val_loss:
                    best_val_loss = avg_val_loss
                    patience_counter = 0
                    best_state = self.model.state_dict().copy()
                else:
                    patience_counter += 1
                    if patience_counter >= patience:
                        logger.info("early_stopping", epoch=epoch, best_val_loss=best_val_loss)
                        break

            if epoch % 10 == 0:
                logger.info(
                    "lstm_epoch",
                    epoch=epoch,
                    train_loss=round(avg_train_loss, 6),
                    val_loss=round(avg_val_loss, 6) if val_loader else None,
                )

        # Restore best model
        if best_state:
            self.model.load_state_dict(best_state)

        metrics = {
            "final_train_loss": history["train_loss"][-1],
            "best_val_loss": best_val_loss if val_loader else None,
            "epochs_trained": len(history["train_loss"]),
            "early_stopped": patience_counter >= patience,
        }

        logger.info("lstm_training_complete", **metrics)
        return metrics

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predict probability of positive 20-day return.
        PRD Section 6.4: LSTM weight = 30% of final ensemble.
        """
        if self.model is None:
            raise ValueError("Model not trained or loaded")

        self.model.eval()
        features = self._normalize(X[FEATURE_COLUMNS].values.astype(np.float32))

        # Create sequences
        dataset = StockSequenceDataset(
            features,
            np.zeros(len(features)),  # Dummy targets
            SEQUENCE_LENGTH,
        )
        dataloader = DataLoader(dataset, batch_size=64, shuffle=False)

        all_probs = []
        with torch.no_grad():
            for X_batch, _ in dataloader:
                X_batch = X_batch.to(self.device)
                output = self.model(X_batch)
                all_probs.extend(output.cpu().numpy().flatten())

        return np.array(all_probs)

    def save(self, directory: str, version: str) -> str:
        """Save model, scaler params, and metadata."""
        path = Path(directory) / version
        path.mkdir(parents=True, exist_ok=True)

        if self.model:
            torch.save(self.model.state_dict(), path / "lstm_model.pt")
        np.save(path / "scaler_mean.npy", self.scaler_mean)
        np.save(path / "scaler_std.npy", self.scaler_std)

        self.model_version = version
        logger.info("lstm_saved", path=str(path))
        return str(path)

    def load(self, directory: str, version: str) -> None:
        """Load model and scaler from disk."""
        path = Path(directory) / version

        self.scaler_mean = np.load(path / "scaler_mean.npy")
        self.scaler_std = np.load(path / "scaler_std.npy")

        input_size = len(FEATURE_COLUMNS)
        self.model = LSTMPredictor(input_size=input_size).to(self.device)
        self.model.load_state_dict(torch.load(path / "lstm_model.pt", map_location=self.device))
        self.model.eval()

        self.model_version = version
        logger.info("lstm_loaded", version=version)
