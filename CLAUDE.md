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

### **Network Access Configuration Errors**
✅ **Use single source of truth for HOST_IP:**
```env
# .env file - ONLY place to define network IP
HOST_IP=10.20.30.40
```

### **Color Scheme Consistency Errors**
✅ **CRITICAL: Use ONLY our established VSCode colors - NOT the Master Guide colors:**
```typescript
// ✅ CORRECT: Our VSCode Dark Theme (Use these EXACT colors)
Background: '#1e1e1e'              // App background
Cards: 'bg-[#2d2d30] border-[#3e3e42]'  // Card styling
Primary text: 'text-[#cccccc]'     // Main text color
Secondary text: 'text-[#969696]'   // Muted text
Primary button: 'bg-[#007acc]'     // VSCode blue
```

```typescript
// ❌ WRONG: Do NOT use these Master Guide colors (will break consistency)
Background: '#0f172a'              // Too light for VSCode theme
Cards: 'bg-slate-800 border-slate-700'  // Doesn't match VSCode
Text: 'text-slate-50'             // Wrong text hierarchy
Primary: 'bg-blue-500'            // Wrong blue shade
```

✅ **For Chunk 4 Dashboard components, use EXACT existing patterns:**
```typescript
// Summary cards - use existing Card component styling
<Card className="bg-[#2d2d30] border-[#3e3e42]">
  <div className="text-[#969696] text-sm">Label</div>
  <div className="text-2xl font-bold text-[#cccccc]">Value</div>
</Card>

// Utilization colors (keep consistent with current system)
available: 'text-emerald-400'      // Under 70%
optimal: 'text-blue-400'          // 70-85%  
high: 'text-amber-400'            // 85-100%
overallocated: 'text-red-400'     // Over 100%
```

❌ **Never use slate-* Tailwind classes** - they don't match our VSCode theme
❌ **Never change our established color palette** - it's been carefully implemented
❌ **Never follow Master Guide color examples** - they're outdated

✅ **Let Django handle ALLOWED_HOSTS and CORS dynamically:**
```python
# Django settings.py - automatically includes HOST_IP
HOST_IP = os.getenv('HOST_IP')
if HOST_IP and HOST_IP not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(HOST_IP)
```

✅ **Use environment variables in docker-compose.yml:**
```yaml
# docker-compose.yml - construct URLs from HOST_IP
environment:
  - VITE_API_URL=http://${HOST_IP}:8000/api
```

✅ **Test network access after IP changes:**
```bash
# Verify CORS headers include network IP
curl -I -H "Origin: http://${HOST_IP}:3000" http://${HOST_IP}:8000/api/people/
```

❌ **Never hardcode IP addresses** in source code or config files
❌ **Never assume** localhost/127.0.0.1 will work from other computers
❌ **Never forget** to update CORS origins when changing network configuration

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

# 5. Network Access Test (if HOST_IP is configured)
if [ ! -z "$HOST_IP" ]; then
  curl -s http://$HOST_IP:8000/api/health/ | grep "healthy"
  echo "✅ Should return: healthy (network access)"
fi

# 6. Console Warning Check
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

## 🎨 Component Usage Examples - CHUNK 4 DASHBOARD COLORS
```typescript
// ✅ CRITICAL: Use these EXACT color patterns for Chunk 4 Dashboard
// (Matches our established VSCode theme)

// Dashboard summary cards
<Card className="bg-[#2d2d30] border-[#3e3e42]">
  <div className="text-[#969696] text-sm">Total Team Members</div>
  <div className="text-2xl font-bold text-[#cccccc]">12</div>
</Card>

// Team overview section  
<Card className="md:col-span-2 bg-[#2d2d30] border-[#3e3e42]">
  <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Team Overview</h3>
  <div className="space-y-3">
    {people.map(person => (
      <div key={person.id} className="flex items-center justify-between p-3 bg-[#3e3e42]/50 rounded-lg">
        <div>
          <div className="font-medium text-[#cccccc]">{person.name}</div>
          <div className="text-sm text-[#969696]">{person.role}</div>
        </div>
        <UtilizationBadge percentage={person.utilization} />
      </div>
    ))}
  </div>
</Card>

// Utilization badge component (create for Chunk 4)
const UtilizationBadge = ({ percentage }: { percentage: number }) => {
  const getUtilizationStyle = (percent: number) => {
    if (percent < 70) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (percent <= 85) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'  
    if (percent <= 100) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    return 'bg-red-500/20 text-red-400 border-red-500/30'
  }
  
  return (
    <span className={`px-2 py-1 rounded border text-xs font-medium ${getUtilizationStyle(percentage)}`}>
      {percentage}% utilized
    </span>
  )
}

// Available people section
<Card className="bg-[#2d2d30] border-[#3e3e42]">
  <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Available</h3>
  <div className="space-y-2">
    {availablePeople.map(person => (
      <div key={person.id} className="text-sm">
        <div className="text-[#cccccc]">{person.name}</div>
        <div className="text-emerald-400">{person.availableHours}h available</div>
      </div>
    ))}
  </div>
</Card>
```

```typescript
// ❌ WRONG: Never use these patterns (from outdated Master Guide)
<Card className="bg-slate-800 border-slate-700">  // WRONG COLORS
  <div className="text-slate-400 text-sm">Label</div>  // WRONG TEXT COLOR
  <div className="text-2xl font-bold text-slate-50">Value</div>  // WRONG TEXT COLOR
</Card>
```

**Last Updated**: After implementing network access configuration and documenting color scheme consistency for Chunk 4