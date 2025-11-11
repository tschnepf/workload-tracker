# Microsoft Single Sign-On Implementation Plan

## 🎯 Executive Summary

This plan outlines the integration of Microsoft Azure AD/Entra ID Single Sign-On (SSO) for the Workload Tracker application. The implementation will replace the current username/password authentication with enterprise-grade Microsoft SSO while maintaining the existing user profile system and person linking functionality.

## 🏗️ Current Authentication Architecture Analysis

### Backend (Django REST API)
- **Framework**: Django + Django REST Framework
- **Current Auth**: SimpleJWT (access/refresh tokens)
- **User Management**: Custom `UserProfile` model linked to Django's `User` model
- **Person Linking**: `UserProfile.person` → `people.Person` relationship
- **Permissions**: Role-based access (`admin`, `manager`, `user`) with group assignments
- **Features**: Password changes, user creation, audit logging via `AdminAuditLog`

### Frontend (React TypeScript)
- **Auth State Management**: Custom observable store (`frontend/src/store/auth.ts`)
- **Storage**: JWT access tokens in memory, refresh tokens in localStorage
- **Cross-tab Sync**: localStorage event listeners for session synchronization
- **Login Flow**: Traditional username/password form (`frontend/src/pages/Auth/Login.tsx`)

## 🚀 Implementation Strategy

### Phase 1: Azure AD Configuration & Backend Integration

#### 1.1 Azure AD App Registration
**Duration**: 1-2 days

**Tasks**:
- Register new Azure AD application in Microsoft Entra admin center
- Configure redirect URIs for both development and production environments
- Set up API permissions and scopes
- Generate client secret for backend verification
- Configure single-page application (SPA) settings for frontend

**Deliverables**:
- Azure AD application registration with client ID
- Client secret for backend token validation
- Configured redirect URIs and API scopes
- Documentation of Azure AD configuration

#### 1.2 Backend SSO Integration
**Duration**: 3-4 days

**Approach**: Hybrid authentication system supporting both SSO and existing JWT

**Dependencies**:
```bash
# Add to backend requirements
django-auth-adfs==1.14.0          # Azure AD/ADFS authentication
PyJWT==2.8.0                      # JWT token validation
cryptography==41.0.7              # JWT signature verification
requests==2.31.0                  # HTTP client for token introspection
```

**Implementation**:

1. **Custom Authentication Backend** (`backend/accounts/auth_backends.py`):
   ```python
   class AzureADBackend:
       def authenticate(self, request, azure_token=None, **kwargs):
           # Validate Azure AD JWT token
           # Create or get Django user from Azure AD claims
           # Link to existing UserProfile system
   ```

2. **Token Validation Middleware** (`backend/accounts/middleware.py`):
   - Validate Azure AD access tokens
   - Extract user claims (email, name, groups)
   - Support both Azure AD tokens and existing SimpleJWT tokens

3. **User Provisioning Logic**:
   - Auto-create Django users from Azure AD claims
   - Map Azure AD groups to Django groups (`admin`, `manager`, `user`)
   - Preserve existing `UserProfile` → `Person` linking system
   - Handle email-based person matching for auto-linking

4. **Settings Configuration** (`backend/config/settings.py`):
   ```python
   # Azure AD Configuration
   AZURE_AD = {
       'CLIENT_ID': os.getenv('AZURE_CLIENT_ID'),
       'CLIENT_SECRET': os.getenv('AZURE_CLIENT_SECRET'),
       'TENANT_ID': os.getenv('AZURE_TENANT_ID'),
       'AUTHORITY': f"https://login.microsoftonline.com/{os.getenv('AZURE_TENANT_ID')}",
       'JWKS_URI': f"https://login.microsoftonline.com/{os.getenv('AZURE_TENANT_ID')}/discovery/v2.0/keys",
       'ISSUER': f"https://login.microsoftonline.com/{os.getenv('AZURE_TENANT_ID')}/v2.0",
   }
   
   AUTHENTICATION_BACKENDS = [
       'accounts.auth_backends.AzureADBackend',
       'django.contrib.auth.backends.ModelBackend',  # Fallback for existing users
   ]
   ```

**Testing**:
- Unit tests for token validation
- Integration tests for user provisioning
- API endpoint testing with Azure AD tokens

### Phase 2: Frontend MSAL Integration

#### 2.1 MSAL.js Setup
**Duration**: 2-3 days

**Dependencies**:
```bash
# Add to frontend package.json
npm install @azure/msal-react@3.0.21 @azure/msal-browser@3.20.0
```

**Implementation**:

1. **MSAL Configuration** (`frontend/src/auth/msalConfig.ts`):
   ```typescript
   import { Configuration, LogLevel } from '@azure/msal-browser';
   
   export const msalConfig: Configuration = {
     auth: {
       clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
       authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
       redirectUri: `${window.location.origin}/auth/callback`,
       postLogoutRedirectUri: window.location.origin,
     },
     cache: {
       cacheLocation: 'localStorage', // SSO across tabs
       storeAuthStateInCookie: true, // IE11 support
     },
   };
   ```

2. **MSAL Instance Initialization** (`frontend/src/auth/msalInstance.ts`):
   ```typescript
   import { PublicClientApplication } from '@azure/msal-browser';
   import { msalConfig } from './msalConfig';
   
   export const msalInstance = new PublicClientApplication(msalConfig);
   ```

3. **App-level Integration** (`frontend/src/App.tsx`):
   ```typescript
   import { MsalProvider } from '@azure/msal-react';
   import { msalInstance } from '@/auth/msalInstance';
   
   function App() {
     return (
       <MsalProvider instance={msalInstance}>
         {/* Existing app structure */}
       </MsalProvider>
     );
   }
   ```

#### 2.2 Authentication Components Refactor
**Duration**: 2-3 days

**Updates**:

1. **New Login Component** (`frontend/src/pages/Auth/MicrosoftLogin.tsx`):
   ```typescript
   import { useMsal } from '@azure/msal-react';
   import { loginRequest } from '@/auth/authConfig';
   
   const MicrosoftLogin: React.FC = () => {
     const { instance } = useMsal();
     
     const handleLogin = async () => {
       try {
         await instance.loginPopup(loginRequest);
         // Navigate to dashboard
       } catch (error) {
         // Handle error
       }
     };
     
     return (
       <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
         <div className="w-full max-w-sm bg-[#2d2d30] border-[#3e3e42] border p-6 rounded shadow">
           <h1 className="text-xl text-[#cccccc] mb-4">Sign in to Workload Tracker</h1>
           <button
             onClick={handleLogin}
             className="w-full bg-[#007acc] hover:bg-[#005a9e] text-white py-2 rounded font-medium"
           >
             Sign in with Microsoft
           </button>
         </div>
       </div>
     );
   };
   ```

2. **Auth Store Integration** (`frontend/src/store/auth.ts`):
   - Integrate MSAL token acquisition with existing auth store
   - Maintain backward compatibility with existing JWT flows
   - Support both authentication methods during transition

3. **Protected Route Updates** (`frontend/src/components/auth/RequireAuth.tsx`):
   - Support both MSAL authentication state and existing JWT tokens
   - Handle token refresh from both sources

### Phase 3: User Management & Person Linking

#### 3.1 Enhanced User Provisioning
**Duration**: 2-3 days

**Features**:

1. **Automatic Person Linking**:
   - Match Azure AD email with `people.Person.email`
   - Auto-link when email matches exactly
   - Require admin approval for non-matching emails
   - Preserve existing manual linking functionality

2. **Group Mapping**:
   - Map Azure AD security groups to Django groups
   - Support configurable group mappings via settings
   - Default role assignment for unmapped users

3. **Admin Interface Enhancements**:
   - View Azure AD user details in Django admin
   - Force re-sync user data from Azure AD
   - Override person linkages with admin privileges

#### 3.2 Migration Strategy
**Duration**: 1-2 days

**Approach**: Gradual migration allowing both authentication methods

1. **Database Migrations**:
   - Add `azure_ad_object_id` field to `UserProfile`
   - Add `last_azure_sync` timestamp
   - Create migration to link existing users by email

2. **Feature Flag Support**:
   ```python
   # settings.py
   FEATURES.update({
       'AZURE_AD_SSO': os.getenv('AZURE_AD_SSO', 'false').lower() == 'true',
       'LEGACY_AUTH_FALLBACK': os.getenv('LEGACY_AUTH_FALLBACK', 'true').lower() == 'true',
   })
   ```

### Phase 4: Testing & Deployment

#### 4.1 Comprehensive Testing
**Duration**: 2-3 days

**Test Coverage**:
- Unit tests for Azure AD token validation
- Integration tests for user provisioning
- E2E tests for complete authentication flows
- Security testing for token handling
- Performance testing for authentication latency

#### 4.2 Environment Configuration
**Duration**: 1-2 days

**Environment Variables**:
```bash
# Backend
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret  
AZURE_TENANT_ID=your-tenant-id
AZURE_AD_SSO=true

# Frontend
VITE_AZURE_CLIENT_ID=your-client-id
VITE_AZURE_TENANT_ID=your-tenant-id
VITE_USE_AZURE_SSO=true
```

**Docker Integration**:
- Update `docker-compose.yml` with new environment variables
- Ensure proper secrets management for production

## 🔄 Migration & Rollback Strategy

### Migration Phases

#### Phase A: Preparation (No User Impact)
- Deploy backend with Azure AD support disabled
- Add MSAL libraries to frontend without activating
- Set up Azure AD app registration
- Test in development environment

#### Phase B: Pilot Deployment (Limited Users)
- Enable Azure AD SSO for admin users only
- Test person linking and role assignment
- Validate token handling and refresh flows
- Monitor authentication performance

#### Phase C: Full Rollout (All Users)
- Enable Azure AD SSO for all users
- Maintain legacy login as fallback option
- Monitor authentication success rates
- Provide user training and documentation

#### Phase D: Legacy Cleanup (Future)
- Remove legacy authentication endpoints
- Clean up unused JWT configuration
- Archive old authentication code

### Rollback Plan
- Feature flags allow instant disabling of Azure AD SSO
- Legacy authentication remains functional throughout migration
- Database changes are additive (no data loss)
- Frontend gracefully falls back to original login form

## 🛡️ Security Considerations

### Token Security
- Azure AD tokens validated using Microsoft's public key infrastructure
- Short-lived access tokens (1 hour default)
- Secure token storage (sessionStorage vs localStorage options)
- Proper CORS configuration for token endpoints

### User Privacy
- Minimal claims requested from Azure AD (email, name, groups)
- GDPR compliance maintained through existing data handling
- User consent flows for additional permissions
- Audit logging for all authentication events

### Network Security
- HTTPS required for all authentication flows
- Proper redirect URI validation
- CSP headers updated for Microsoft domains
- Rate limiting on authentication endpoints

## 📊 Success Metrics

### Technical Metrics
- Authentication success rate > 99%
- Average authentication time < 3 seconds
- Zero security vulnerabilities in token handling
- 100% backward compatibility during migration

### User Experience Metrics
- Reduced login friction (single click vs form completion)
- Elimination of password reset requests
- Improved user onboarding time
- Positive user feedback on SSO experience

### Business Metrics
- Reduced IT support tickets for authentication issues
- Improved compliance with enterprise security policies
- Better user adoption due to seamless access
- Enhanced audit capabilities for user access

## 🗓️ Implementation Timeline

| Phase | Duration | Dependencies | Risk Level |
|-------|----------|--------------|------------|
| Azure AD Setup | 1-2 days | Azure admin access | Low |
| Backend Integration | 3-4 days | Azure AD setup | Medium |
| Frontend MSAL | 2-3 days | Backend ready | Medium |
| User Management | 2-3 days | Both backend/frontend | High |
| Testing | 2-3 days | Full implementation | Medium |
| Deployment | 1-2 days | All testing complete | Low |

**Total Estimated Duration**: 11-17 days (2.2-3.4 weeks)

## 🚨 Risk Assessment & Mitigation

### High-Risk Items
1. **Person Linking Logic**: Complex business logic for matching users to people
   - **Mitigation**: Extensive testing with real data, admin override capabilities
   
2. **Token Validation**: Security-critical JWT validation
   - **Mitigation**: Use proven libraries, comprehensive security testing

3. **User Migration**: Risk of locking out existing users
   - **Mitigation**: Parallel authentication support, gradual rollout

### Medium-Risk Items
1. **Azure AD Configuration**: Incorrect settings could break authentication
   - **Mitigation**: Documentation, testing in dev environment first

2. **Frontend State Management**: Complex integration with existing auth store
   - **Mitigation**: Thorough testing, feature flags for rollback

### Low-Risk Items
1. **Environment Variables**: Configuration management
   - **Mitigation**: Clear documentation, validation scripts

## 📋 Acceptance Criteria

### Functional Requirements
- [ ] Users can authenticate using Microsoft SSO
- [ ] Existing users are automatically linked to their Person records when emails match
- [ ] Admins can manually link users to Person records
- [ ] Role assignments are preserved from Azure AD groups
- [ ] Legacy authentication remains functional as fallback
- [ ] All existing functionality works unchanged after authentication

### Non-Functional Requirements
- [ ] Authentication completes within 3 seconds
- [ ] No degradation in application performance
- [ ] Security audit passes with zero high-severity findings
- [ ] 100% uptime during migration
- [ ] Documentation updated for new authentication flow

### Technical Requirements
- [ ] Comprehensive test coverage (>90%)
- [ ] Proper error handling and user feedback
- [ ] Graceful fallback to legacy authentication
- [ ] Audit logging for all authentication events
- [ ] GDPR compliance maintained
- [ ] Mobile-responsive authentication flows

## 🔧 Post-Implementation Maintenance

### Ongoing Tasks
- Monitor Azure AD token expiration and renewal
- Update Azure AD app registration as needed
- Maintain group mappings as organizational structure changes
- Regular security reviews of authentication configuration
- User training and documentation updates

### Long-term Considerations
- Migration to Microsoft Entra External ID (Azure AD B2C replacement)
- Integration with other Microsoft services (Graph API, Teams)
- Advanced conditional access policies
- Multi-factor authentication enforcement
- Single logout across all applications

---

*This implementation plan provides a comprehensive roadmap for integrating Microsoft SSO while maintaining system stability and user experience. The phased approach allows for careful testing and rollback capabilities at each step.*