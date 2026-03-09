-- ============================================================
-- NSE AI Stock Recommendation System — Database Schema
-- PRD v1.0 Section 5.2
-- Run: psql -U nseai -d nseai -f init_db.sql
-- ============================================================

-- Enable TimescaleDB extension for time-series hypertables
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUM Types ───────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE market_cap_bucket AS ENUM ('large', 'mid', 'small');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE horizon_type AS ENUM ('short', 'medium');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE direction_type AS ENUM ('long', 'neutral');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               VARCHAR(255) UNIQUE NOT NULL,
    name                VARCHAR(200) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,  -- bcrypt cost factor 12
    role                user_role NOT NULL DEFAULT 'user',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts BIGINT DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- ═══════════════════════════════════════════════════════════════
-- REFRESH TOKENS
-- PRD Section 7.4: Server-side blacklist on logout
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════
-- STOCKS — Master Symbol Registry
-- PRD: is_active=False if delisted (avoids survivorship bias)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stocks (
    symbol              VARCHAR(20) PRIMARY KEY,
    company_name        VARCHAR(200) NOT NULL,
    market_cap_bucket   market_cap_bucket NOT NULL,
    sector              VARCHAR(100) NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    listed_date         DATE,
    isin                VARCHAR(20),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════
-- OHLCV DAILY — Price History (TimescaleDB Hypertable)
-- PRD: No FLOAT — NUMERIC(12,4) for financial precision
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ohlcv_daily (
    time        TIMESTAMPTZ NOT NULL,
    symbol      VARCHAR(20) NOT NULL REFERENCES stocks(symbol),
    open        NUMERIC(12, 4) NOT NULL,
    high        NUMERIC(12, 4) NOT NULL,
    low         NUMERIC(12, 4) NOT NULL,
    close       NUMERIC(12, 4) NOT NULL,
    volume      BIGINT NOT NULL,
    adj_close   NUMERIC(12, 4) NOT NULL,
    data_source VARCHAR(50) DEFAULT 'yfinance',
    PRIMARY KEY (time, symbol)
);

-- Convert to TimescaleDB hypertable (partition by time, 1-month chunks)
SELECT create_hypertable('ohlcv_daily', 'time',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_time ON ohlcv_daily(symbol, time DESC);


-- ═══════════════════════════════════════════════════════════════
-- FEATURES DAILY — Engineered Feature Matrix
-- PRD Section 5.2: One row per stock per day
-- All computed with expanding-window (ZERO look-ahead bias)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS features_daily (
    time            TIMESTAMPTZ NOT NULL,
    symbol          VARCHAR(20) NOT NULL REFERENCES stocks(symbol),

    -- Technical Indicators (Literature Review Section 3)
    rsi_14          NUMERIC(8, 4),      -- RSI(14), expanding window
    macd_signal     NUMERIC(8, 4),      -- NULL when ADX <= 25 (ADX-gated)
    bb_bandwidth    NUMERIC(8, 4),      -- Bollinger Bandwidth (volatility proxy)
    ma200_regime    BOOLEAN,            -- True = price > 200-day MA (Bull regime)
    adx_value       NUMERIC(8, 4),      -- ADX for MACD gating
    atr_14          NUMERIC(8, 4),      -- Average True Range (14-period)

    -- Fundamental Indicators (Literature Review Section 9)
    fcf_yield       NUMERIC(8, 4),      -- Quarterly, forward-filled between reports
    pe_zscore       NUMERIC(8, 4),      -- Z-score vs sector peers (NOT absolute P/E)
    de_ratio        NUMERIC(8, 4),      -- Debt-to-equity

    -- Sentiment (Literature Review Section 6)
    sentiment_24h   NUMERIC(5, 4),      -- FinBERT score in [-1, +1]
    sentiment_72h   NUMERIC(5, 4),      -- 3-day rolling average sentiment

    -- Volume
    volume_z_3m     NUMERIC(8, 4),      -- Z-score vs 3-month rolling mean

    PRIMARY KEY (time, symbol)
);

-- Also make features a hypertable for time-series queries
SELECT create_hypertable('features_daily', 'time',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_features_symbol_time ON features_daily(symbol, time DESC);


-- ═══════════════════════════════════════════════════════════════
-- RECOMMENDATIONS — Model Outputs
-- PRD: Direction = 'long' or 'neutral' only (no short recs, SEBI)
-- PRD: model_version = MLflow run ID for auditability
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS recommendations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol              VARCHAR(20) NOT NULL REFERENCES stocks(symbol),
    score               NUMERIC(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
    horizon             horizon_type NOT NULL,
    direction           direction_type NOT NULL,
    confidence_pct      NUMERIC(5, 2) NOT NULL CHECK (confidence_pct >= 0 AND confidence_pct <= 100),
    reasoning_json      JSONB NOT NULL,
    model_version       VARCHAR(100) NOT NULL,
    market_cap_bucket   market_cap_bucket NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rec_generated ON recommendations(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_symbol ON recommendations(symbol);
CREATE INDEX IF NOT EXISTS idx_rec_bucket_score ON recommendations(market_cap_bucket, score DESC);


-- ═══════════════════════════════════════════════════════════════
-- BACKTEST RESULTS — Walk-Forward Validation Records
-- PRD Section 8.2: Performance gates stored per backtest run
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS backtest_results (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name          VARCHAR(50) NOT NULL,
    market_cap_bucket   market_cap_bucket NOT NULL,
    mlflow_run_id       VARCHAR(100) NOT NULL,
    sharpe_ratio        NUMERIC(6, 4) NOT NULL,
    max_drawdown        NUMERIC(6, 4) NOT NULL,
    win_rate            NUMERIC(6, 4) NOT NULL,
    calmar_ratio        NUMERIC(6, 4) NOT NULL,
    p_value             NUMERIC(8, 6) NOT NULL,
    meets_gate          BOOLEAN NOT NULL,
    walk_forward_folds  BIGINT NOT NULL,
    config_json         JSONB NOT NULL,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════
-- MONTE CARLO CACHE
-- PRD Section 6.3: Results cached 24h, async computation
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS montecarlo_cache (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol                  VARCHAR(20) NOT NULL REFERENCES stocks(symbol),
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    horizon_days            BIGINT NOT NULL,
    prob_positive_5d        NUMERIC(6, 4),
    prob_positive_20d       NUMERIC(6, 4),
    var_5pct                NUMERIC(8, 4),
    expected_return_median  NUMERIC(8, 4),
    ci_lower_95             NUMERIC(8, 4),
    ci_upper_95             NUMERIC(8, 4),
    paths_run               BIGINT DEFAULT 10000,
    garch_params_json       JSONB
);

CREATE INDEX IF NOT EXISTS idx_mc_symbol_time ON montecarlo_cache(symbol, computed_at DESC);


-- ═══════════════════════════════════════════════════════════════
-- CLEANUP: Auto-purge old MC cache (older than 7 days)
-- ═══════════════════════════════════════════════════════════════
-- TimescaleDB retention policy (if desired):
-- SELECT add_retention_policy('montecarlo_cache', INTERVAL '7 days');


-- ═══════════════════════════════════════════════════════════════
-- Helper: Updated_at trigger
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stocks_updated_at
    BEFORE UPDATE ON stocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
