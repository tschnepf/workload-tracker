# Claude Code Reference - Workload Tracker

## 🚀 Project Status
- **Current Phase**: Chunk 2 Complete (People Management)
- **Next Phase**: Chunk 3 (Assignment Basics)
- **Architecture**: Django REST API + React TypeScript + PostgreSQL
- **Theme**: Dark Mode Only (slate color system)

## 📋 Development Commands

### **Backend (Django)**
```bash
# Run migrations
docker-compose exec backend python manage.py migrate

# Create superuser (if needed)
docker-compose exec backend python manage.py createsuperuser

# Django shell
docker-compose exec backend python manage.py shell
```

### **Frontend (React)**
```bash
# Install exact package versions (NEVER use caret ranges)
docker-compose exec frontend npm install package-name@exact.version

# Check current versions
docker-compose exec frontend npm list package-name
```

### **Docker**
```bash
# Start all services
docker-compose up -d

# Rebuild after package.json changes
docker-compose build frontend

# View logs
docker-compose logs frontend --tail=20
```

## 🎯 Standards Compliance

### **Package Management**
- ✅ **ALWAYS**: Pin exact versions (no `^` or `~`)
- ✅ **ALWAYS**: Use latest stable versions
- ❌ **NEVER**: Ignore console warnings
- ❌ **NEVER**: Install unused dependencies

### **Dark Mode Requirements**
- ✅ Use only approved slate colors (`slate-900`, `slate-800`, etc.)
- ✅ Maintain consistent component patterns
- ✅ Follow established form/table styling

### **Naming Prevention**
- ✅ Backend uses `snake_case` (Django standard)
- ✅ Frontend uses `camelCase` (JavaScript standard)  
- ✅ Auto-transformation via serializers (never manual mapping)

## 🔗 Key URLs
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/api
- **Django Admin**: http://localhost:8000/admin (admin/admin123)
- **Health Check**: http://localhost:8000/api/health

## 📁 File Structure Reference
```
├── backend/                 # Django REST API
│   ├── core/               # Naming prevention system
│   ├── people/             # Person model & CRUD
│   ├── assignments/        # Assignment model (Chunk 3)
│   └── config/             # Django settings
├── frontend/               # React TypeScript
│   ├── src/
│   │   ├── components/ui/  # Button, Input, Card
│   │   ├── pages/         # Route components
│   │   ├── services/      # API integration
│   │   └── types/         # Generated interfaces
└── prompts/               # Documentation & standards
```

## ⚠️ Critical Reminders
1. **Always check console for warnings** - fix immediately
2. **Test CRUD operations** after any API changes  
3. **Verify dark mode consistency** across all components
4. **Use exact package versions** - never ranges
5. **Follow progressive usage strategy** - don't expose all fields at once

## 🐛 Error Prevention Checklist

### **Import/Path Resolution Errors**
✅ **Always verify after Docker changes:**
```bash
# After any vite.config.ts or tsconfig.json changes
docker-compose build frontend
docker-compose restart frontend
```

✅ **Test imports immediately:**
```bash
# Verify @/ imports work
curl -s http://localhost:3000/ | grep "<title>"
```

❌ **Never assume** path aliases work without testing

### **API Response Parsing Errors**
✅ **Handle empty responses properly:**
```typescript
// ✅ Check content type before parsing JSON
const contentType = response.headers.get('content-type');
if (!contentType || !contentType.includes('application/json')) {
  return undefined;
}
```

✅ **Test DELETE operations specifically:**
```bash
# DELETE should return HTTP 204 No Content
curl -X DELETE http://localhost:8000/api/people/1/ -w "Status: %{http_code}"
```

❌ **Never assume** all API responses contain JSON

### **Docker Container State Issues**
✅ **Always restart containers after config changes:**
```bash
# Config changes require container rebuilds
docker-compose build [service]
docker-compose restart [service]
```

✅ **Verify container health before testing:**
```bash
docker-compose ps  # All should show "Up"
docker-compose logs [service] --tail=10
```

❌ **Never test** immediately after config changes without restart

### **Package Version Conflicts**  
✅ **Clean install after package.json changes:**
```bash
docker-compose exec frontend rm -f package-lock.json
docker-compose exec frontend npm install
```

✅ **Verify exact versions installed:**
```bash
docker-compose exec frontend npm list react react-router-dom
```

❌ **Never ignore** version mismatch warnings

## 🧪 Testing Workflow (Run After Every Change)

### **Mandatory Test Sequence**
```bash
# 1. Container Health Check
docker-compose ps
echo "✅ All containers should show 'Up'"

# 2. Backend API Test
curl -s http://localhost:8000/api/health/ | grep "healthy"
echo "✅ Should return: healthy"

# 3. Frontend Load Test  
curl -s http://localhost:3000/ | grep "<title>"
echo "✅ Should return: <title>Workload Tracker</title>"

# 4. CRUD Operation Test (if applicable)
curl -s http://localhost:8000/api/people/ | grep "count"
echo "✅ Should return people data"

# 5. Console Warning Check
echo "🖥️  Open browser dev tools - should be NO warnings"
```

### **After Config Changes (vite.config.ts, package.json, etc.)**
```bash
# Full rebuild sequence
docker-compose down
docker-compose build
docker-compose up -d
# Wait 30 seconds
# Run mandatory test sequence above
```

### **Red Flag Indicators** 
❌ **Stop immediately if you see:**
- Console errors or warnings
- Import resolution failures  
- HTTP 500 errors from backend
- Empty/broken frontend pages
- Version mismatch warnings
- Docker container restart loops

## 🎨 Component Usage Examples
```typescript
// ✅ Correct dark mode component usage
<Card className="bg-slate-800 border-slate-700">
  <Input 
    label="Name" 
    className="bg-slate-700 border-slate-600 text-slate-50"
    error={validationError}
  />
  <Button variant="primary">Save</Button>
</Card>
```

**Last Updated**: After Chunk 2 completion with package version fixes