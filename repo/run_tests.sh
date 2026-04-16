#!/bin/bash

echo "============================================"
echo "PetMed Operations Suite — Test Runner"
echo "============================================"
echo ""
echo "All tests run inside Docker containers."
echo ""

cd "$(dirname "$0")"

# Ensure services are up (build if needed, start, wait for healthy)
echo "Starting services..."
docker compose up -d --build db backend 2>&1 | tail -5
echo "Waiting for database to be healthy..."
until docker compose exec -T db pg_isready -U petmed > /dev/null 2>&1; do
  sleep 2
done
echo "Waiting for backend to be ready..."
until curl -sf http://localhost:3020/api/health > /dev/null 2>&1; do
  sleep 2
done
echo "Services ready."

# Helper: run a command inside a disposable test-runner container
# Uses --profile test to include the test-runner service definition
run_test() {
  docker compose --profile test run --rm test-runner sh -c "$1"
}

# Install deps (node_modules are on the bind mount so they persist across runs)
echo "Installing dependencies..."
run_test "cd /repo/backend && npm install --include=dev 2>&1 | tail -1"
run_test "cd /repo/frontend && npm install --legacy-peer-deps 2>&1 | tail -1"
echo ""

echo "[1/3] Running Unit Tests..."
echo "--------------------------------------------"
run_test "cd /repo/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest --config jest.config.js --testPathPattern='unit_tests' --forceExit --verbose 2>&1" || UNIT_EXIT=$?
UNIT_EXIT=${UNIT_EXIT:-0}

echo ""
echo "[1.5/3] Running Frontend Component Tests..."
echo "--------------------------------------------"
run_test "cd /repo/frontend && npx vitest run --reporter=verbose 2>&1" || FRONTEND_EXIT=$?
FRONTEND_EXIT=${FRONTEND_EXIT:-0}

echo ""
echo "[2/3] Running API Tests..."
echo "--------------------------------------------"
echo "  API URL: http://backend:3020 (Docker network)"
echo ""

# Reset DB state for deterministic API tests
echo "  Resetting test DB state..."
docker compose exec -T db psql -U petmed -c "
  UPDATE users SET failed_login_count=0, locked_until=NULL, last_failed_at=NULL;
  DELETE FROM cart_items;
  UPDATE carts SET status = 'abandoned' WHERE status = 'active';
  DELETE FROM hold_slots;
  DELETE FROM holds;
  UPDATE constrained_slots SET status='available';
  UPDATE sku_suppliers SET unit_price = 2.50 WHERE sku_id = '14000000-0000-0000-0000-000000000001' AND supplier_id = '12000000-0000-0000-0000-000000000001';
  UPDATE sku_suppliers SET unit_price = 3.00 WHERE sku_id = '14000000-0000-0000-0000-000000000002' AND supplier_id = '12000000-0000-0000-0000-000000000001';
  UPDATE inventory SET available_qty=10000, reserved_qty=0;
" || echo "  DB reset failed (is the database running?)"
echo ""

run_test "cd /repo/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest --config jest.config.js --testPathPattern='API_tests' --forceExit --verbose --testTimeout=60000 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tee /dev/stderr | grep '^Test Suites:' | tail -1 > /tmp/petmed_api_summary.txt"
API_SUMMARY=$(cat /tmp/petmed_api_summary.txt 2>/dev/null)
if echo "$API_SUMMARY" | grep -q "failed"; then
  API_EXIT=1
else
  API_EXIT=0
fi

echo ""
echo "============================================"
echo "Test Results Summary"
echo "============================================"
if [ $UNIT_EXIT -eq 0 ]; then
  echo "  Unit Tests:      PASSED"
else
  echo "  Unit Tests:      FAILED"
fi

if [ $FRONTEND_EXIT -eq 0 ]; then
  echo "  Frontend Tests:  PASSED"
else
  echo "  Frontend Tests:  FAILED"
fi

if [ $API_EXIT -eq 0 ]; then
  echo "  API Tests:       PASSED"
else
  echo "  API Tests:       FAILED"
fi
echo "============================================"

if [ $UNIT_EXIT -ne 0 ] || [ $FRONTEND_EXIT -ne 0 ] || [ $API_EXIT -ne 0 ]; then
  exit 1
fi
