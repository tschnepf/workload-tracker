# Microsoft SSO Owner Questionnaire

Purpose: Collect the minimum decisions needed to implement Azure/Entra SSO, provisioning, and department mapping correctly.

## 1) Tenant Scope & Cloud Environment
1. Is this **single-tenant** only, or **multi-tenant**?
2. Are there **multiple Azure tenants** (e.g., M&A) we must support?
3. Which **cloud** are you in? (Commercial Azure, GCC, GCC High, DoD, other)

## 2) Provisioning Method
4. Do you prefer **push provisioning** from Azure (SCIM) or **pull provisioning** by us (Microsoft Graph delta sync)?
5. If SCIM: is Azure App Provisioning enabled and supported in your tenant?
6. If Graph: is a scheduled sync acceptable (e.g., every 15–60 minutes)?

## 3) Identity Linking
7. Is **email/UPN** the authoritative identifier for matching existing users?
8. Can emails/UPNs change? If yes, how should we handle updates?
9. Are **alias addresses** or **secondary emails** used? Should those link to the same user?

## 4) Department Mapping
10. Which should be the **primary source** of department info?
    - Azure `department` attribute
    - Azure groups
    - Both (with priority order)
11. If groups are used, which **groups map to which departments**?
12. Are group memberships large (e.g., users in many groups), or can we limit groups to those assigned to the app?

## 5) Lifecycle & Deprovisioning
13. When a user is disabled in Azure, should we:
    - Block login only
    - Fully deactivate the user
    - Archive but keep historical data
14. Should disabled users be removed from departments or kept for reporting?

## 6) Access & Permissions
15. Who will manage the **App Registration** (client ID/secret, redirect URIs)?
16. Can you grant required **Graph permissions** (if needed)?
17. Do you have **Conditional Access** or MFA policies that could block Graph/SCIM access?

## 7) User Population & Exclusions
18. Should **all Azure users** be provisioned, or only specific groups?
19. Are there **service accounts**, shared mailboxes, or external accounts to exclude?

## 8) User Experience
20. Preferred login UX: **full-page redirect** or **popup**?
21. Should SSO be **mandatory** or optional (SSO + password login)?

## 9) Operational & Security
22. Secret rotation policy: how often are **client secrets** rotated?
23. Who should receive **alerts** if provisioning fails?
24. Do you need **audit logs** for linking/provisioning actions?

---

Notes / Decisions:
- 
