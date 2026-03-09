#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# SentinelQuant — One-command startup
# Usage:   ./start.sh              (starts everything)
#          ./start.sh --backend    (backend only)
#          ./start.sh --frontend   (frontend only)
#          ./start.sh --pipeline   (run daily pipeline once, then exit)
#          ./start.sh --stop       (stop all services)
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
VENV="$PROJECT_ROOT/.venv"
DATA_DIR="$BACKEND_DIR/data"
LOG_DIR="$PROJECT_ROOT/logs"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }

mkdir -p "$LOG_DIR" "$DATA_DIR"

# ── Stop services ────────────────────────────────────────────────────
stop_services() {
    info "Stopping services..."
    if [[ -f "$BACKEND_PID_FILE" ]]; then
        pid=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" && ok "Backend stopped (PID $pid)"
        fi
        rm -f "$BACKEND_PID_FILE"
    fi
    # Kill any orphaned uvicorn
    pkill -f "uvicorn backend.main:app" 2>/dev/null && ok "Killed orphan uvicorn" || true

    if [[ -f "$FRONTEND_PID_FILE" ]]; then
        pid=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" && ok "Frontend stopped (PID $pid)"
        fi
        rm -f "$FRONTEND_PID_FILE"
    fi
    pkill -f "vite" 2>/dev/null && ok "Killed orphan vite" || true
    ok "All services stopped."
}

# ── Pre-flight checks ───────────────────────────────────────────────
preflight() {
    info "Running pre-flight checks..."

    # Python venv
    if [[ ! -f "$VENV/bin/python3" ]]; then
        fail "Virtual environment not found at $VENV"
        echo "  Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
        exit 1
    fi
    ok "Python venv found"

    # Docker
    if ! docker info &>/dev/null; then
        fail "Docker is not running. Start Docker Desktop first."
        exit 1
    fi
    ok "Docker is running"

    # PostgreSQL
    if ! docker ps --format '{{.Names}}' | grep -q 'nseai-postgres'; then
        warn "PostgreSQL container not running. Starting..."
        docker start nseai-postgres 2>/dev/null || {
            fail "Could not start nseai-postgres container."
            echo "  Run the Docker setup from README first."
            exit 1
        }
    fi
    # Wait for healthy
    for i in {1..15}; do
        if docker exec nseai-postgres pg_isready -U postgres &>/dev/null; then
            ok "PostgreSQL is healthy"
            break
        fi
        [[ $i -eq 15 ]] && { fail "PostgreSQL not healthy after 15s"; exit 1; }
        sleep 1
    done

    # Redis
    if ! docker ps --format '{{.Names}}' | grep -q 'nseai-redis'; then
        warn "Redis container not running. Starting..."
        docker start nseai-redis 2>/dev/null || {
            fail "Could not start nseai-redis container."
            exit 1
        }
    fi
    for i in {1..10}; do
        if docker exec nseai-redis redis-cli ping 2>/dev/null | grep -q PONG; then
            ok "Redis is healthy"
            break
        fi
        [[ $i -eq 10 ]] && { fail "Redis not healthy after 10s"; exit 1; }
        sleep 1
    done

    # Model artifacts
    if ls "$BACKEND_DIR/model_artifacts/xgboost/"*.pkl &>/dev/null; then
        ok "Model artifacts found"
    else
        warn "No model artifacts found — recommendations will be empty until you run training"
    fi

    ok "All pre-flight checks passed!"
    echo ""
}

# ── Start Backend ────────────────────────────────────────────────────
start_backend() {
    # Check if already running
    if curl -sf http://localhost:8000/api/v1/admin/health &>/dev/null; then
        warn "Backend already running on :8000"
        return 0
    fi

    info "Starting backend (FastAPI + uvicorn)..."
    cd "$PROJECT_ROOT"
    source "$VENV/bin/activate"
    export PYTHONPATH="$PROJECT_ROOT"

    nohup "$VENV/bin/python3" -m uvicorn backend.main:app \
        --host 0.0.0.0 --port 8000 --reload \
        > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"

    # Wait for healthy
    for i in {1..20}; do
        if curl -sf http://localhost:8000/api/v1/admin/health &>/dev/null; then
            ok "Backend running on http://localhost:8000 (PID $(cat $BACKEND_PID_FILE))"
            return 0
        fi
        sleep 1
    done
    fail "Backend failed to start. Check $LOG_DIR/backend.log"
    return 1
}

# ── Start Frontend ───────────────────────────────────────────────────
start_frontend() {
    # Check if already running
    if curl -sf http://localhost:5173 &>/dev/null; then
        warn "Frontend already running on :5173"
        return 0
    fi

    info "Starting frontend (Vite dev server)..."
    cd "$PROJECT_ROOT"

    # Ensure node_modules exist
    if [[ ! -d "node_modules" ]]; then
        info "Installing npm dependencies..."
        npm install
    fi

    nohup npx vite --host 0.0.0.0 --port 5173 \
        > "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"

    # Wait for ready
    for i in {1..30}; do
        if curl -sf http://localhost:5173 &>/dev/null; then
            ok "Frontend running on http://localhost:5173 (PID $(cat $FRONTEND_PID_FILE))"
            return 0
        fi
        sleep 1
    done
    fail "Frontend failed to start. Check $LOG_DIR/frontend.log"
    return 1
}

# ── Run Pipeline ─────────────────────────────────────────────────────
run_pipeline() {
    info "Running daily pipeline..."
    cd "$PROJECT_ROOT"
    source "$VENV/bin/activate"
    export PYTHONPATH="$PROJECT_ROOT"
    "$VENV/bin/python3" -m backend.scripts.daily_pipeline "$@"
}

# ── Summary ──────────────────────────────────────────────────────────
show_summary() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║      SentinelQuant is running!                ║${NC}"
    echo -e "${GREEN}╠════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Frontend:  http://localhost:5173              ║${NC}"
    echo -e "${GREEN}║  Backend:   http://localhost:8000              ║${NC}"
    echo -e "${GREEN}║  API Docs:  http://localhost:8000/docs         ║${NC}"
    echo -e "${GREEN}║                                                ║${NC}"
    echo -e "${GREEN}║  Logs:      ./logs/backend.log                 ║${NC}"
    echo -e "${GREEN}║             ./logs/frontend.log                ║${NC}"
    echo -e "${GREEN}║                                                ║${NC}"
    echo -e "${GREEN}║  Stop:      ./start.sh --stop                  ║${NC}"
    echo -e "${GREEN}║  Pipeline:  ./start.sh --pipeline              ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ── Main ─────────────────────────────────────────────────────────────
case "${1:-all}" in
    --stop)
        stop_services
        ;;
    --backend)
        preflight
        start_backend
        ;;
    --frontend)
        start_frontend
        ;;
    --pipeline)
        shift
        preflight
        run_pipeline "$@"
        ;;
    all|*)
        preflight
        start_backend
        start_frontend
        show_summary
        ;;
esac
