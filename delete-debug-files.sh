#!/bin/bash

# Script to remove debugging files from Pactify project

echo "Removing debugging files..."

# Remove debug API directory
rm -rf "./app/api/debug"
echo "Removed: app/api/debug/"

# Remove layout-debug.tsx
rm -f "./app/(dashboard)/dashboard/layout-debug.tsx"
echo "Removed: app/(dashboard)/dashboard/layout-debug.tsx"

# Remove debug-user API endpoint
rm -f "./app/api/debug-user/route.ts"
rmdir "./app/api/debug-user" 2>/dev/null
echo "Removed: app/api/debug-user/"

# Remove test-auth API endpoint
rm -f "./app/api/test-auth/route.ts"
rmdir "./app/api/test-auth" 2>/dev/null
echo "Removed: app/api/test-auth/"

# Remove test-subscription API endpoint
rm -f "./app/api/test-subscription/route.ts"
rmdir "./app/api/test-subscription" 2>/dev/null
echo "Removed: app/api/test-subscription/"

# Remove test directory and contract-visibility endpoint
rm -f "./app/api/test/contract-visibility/route.ts"
rmdir "./app/api/test/contract-visibility" 2>/dev/null
rmdir "./app/api/test" 2>/dev/null
echo "Removed: app/api/test/"

# Remove empty debug dashboard directory if it exists
rmdir "./app/(dashboard)/dashboard/debug" 2>/dev/null
echo "Removed empty directories"

# Remove current-user-debug and debug-dashboard if they're empty
rmdir "./app/api/current-user-debug" 2>/dev/null
rmdir "./app/api/debug-dashboard" 2>/dev/null

echo "Debug files cleanup completed!"