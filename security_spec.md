# Workspace ITS - Security Specification & Test Protocol

## 1. Data Invariants
1. **Strict User Isolation**: All user-related data (profiles, subjects, notes pages, materials, chat history, and API keys) reside strictly under `/users/{userId}/...`.
2. **Owner Verification**: Any read, write, create, update, or delete operation requires `request.auth != null` and `request.auth.uid == userId`.
3. **Immutability of Identity**: `userId` in document payloads cannot be modified once set, and must match `request.auth.uid`.
4. **No Cross-Tenant Leaks**: A user (even authenticated) cannot read or write another user's documents under `/users/{otherUserId}`.
5. **No Anonymous Or Blanket Writes**: Unauthenticated requests are completely rejected across all paths.
6. **Payload Bounding**: Field lengths are bounded (titles, names, URLs, IDs) to protect against storage and resource exhaustion attacks.

---

## 2. The "Dirty Dozen" Malicious Payloads

1. **Unauthenticated Read on User Profile**:
   - Path: `/users/user_abc123`
   - Method: `get`
   - Auth: `null` (unauthenticated)
   - Expected: `PERMISSION_DENIED`

2. **Cross-User Profile Spoofing**:
   - Path: `/users/victim_user`
   - Method: `set`
   - Auth: `{ uid: "attacker_user" }`
   - Payload: `{ "userId": "attacker_user", "email": "attacker@evil.com" }`
   - Expected: `PERMISSION_DENIED`

3. **Tampering with Other User's Subjects**:
   - Path: `/users/victim_user/subjects/db_subject`
   - Method: `create`
   - Auth: `{ uid: "attacker_user" }`
   - Payload: `{ "id": "db_subject", "userId": "victim_user", "name": "Hacked" }`
   - Expected: `PERMISSION_DENIED`

4. **Modifying Another User's Notes Page**:
   - Path: `/users/victim_user/pages/secret_page`
   - Method: `update`
   - Auth: `{ uid: "attacker_user" }`
   - Payload: `{ "content": "Wiped data" }`
   - Expected: `PERMISSION_DENIED`

5. **Exfiltrating Other User's Gemini API Keys**:
   - Path: `/users/victim_user/settings/keys`
   - Method: `get`
   - Auth: `{ uid: "attacker_user" }`
   - Expected: `PERMISSION_DENIED`

6. **Injecting Malicious Gemini API Keys to Another Account**:
   - Path: `/users/victim_user/settings/keys`
   - Method: `set`
   - Auth: `{ uid: "attacker_user" }`
   - Payload: `{ "userId": "victim_user", "keys": ["AIzaSyFakeKey"] }`
   - Expected: `PERMISSION_DENIED`

7. **Reading Other User's Course Materials**:
   - Path: `/users/victim_user/materials/mat_1`
   - Method: `get`
   - Auth: `{ uid: "attacker_user" }`
   - Expected: `PERMISSION_DENIED`

8. **Overwriting Other User's Chat Conversation History**:
   - Path: `/users/victim_user/chats/subject_1`
   - Method: `set`
   - Auth: `{ uid: "attacker_user" }`
   - Payload: `{ "id": "subject_1", "userId": "victim_user", "messages": [] }`
   - Expected: `PERMISSION_DENIED`

9. **Ghost Path Injection / Arbitrary Collection Escape**:
   - Path: `/arbitrary_root_collection/malicious_doc`
   - Method: `create`
   - Auth: `{ uid: "attacker_user" }`
   - Payload: `{ "data": "malicious" }`
   - Expected: `PERMISSION_DENIED` (Global Default Deny)

10. **Spoofing Owner ID on Document Creation**:
    - Path: `/users/attacker_user/subjects/sub_1`
    - Method: `create`
    - Auth: `{ uid: "attacker_user" }`
    - Payload: `{ "id": "sub_1", "userId": "victim_user", "name": "Fake Owner" }`
    - Expected: `PERMISSION_DENIED` (Payload userId must match request.auth.uid)

11. **Altering userId on Existing Note Page**:
    - Path: `/users/attacker_user/pages/page_1`
    - Method: `update`
    - Auth: `{ uid: "attacker_user" }`
    - Payload: `{ "userId": "victim_user", "name": "Transferred Page" }`
    - Expected: `PERMISSION_DENIED` (Immutable ownership)

12. **Oversized Junk Payload Injection**:
    - Path: `/users/attacker_user/subjects/sub_giant`
    - Method: `create`
    - Auth: `{ uid: "attacker_user" }`
    - Payload: `{ "id": "sub_giant", "userId": "attacker_user", "name": "A".repeat(5000) }`
    - Expected: `PERMISSION_DENIED` (Exceeds name max size of 100 characters)
