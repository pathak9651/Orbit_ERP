# Mongoose query audit

Reviewed `find`, `findOne`, `findById`, `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, `deleteMany`, `countDocuments`, and `aggregate` calls in server controllers, services, middleware, and the seed script. Line numbers refer to this revision.

| File:line | Method and filter/update source | Request-derived input? | Scope / assessment |
| --- | --- | --- | --- |
| `middlewares/auth.js:13` | `User.findById(payload.sub)` | JWT subject, not request query/body | Session lookup; JWT signature verified first. |
| `scripts/seedAdmin.js:21` | `User.findOne({ email })` | Seed configuration | One configured seed identity; no public request. |
| `services/attendanceLocation.js:81` | `Attendance.updateMany(fixed retention filter, fixed $unset)` | No | Scheduled cleanup by server cutoff; deliberately organization-wide. |
| `services/chatRealtime.js:50,68` | `User.findById(payload.sub/userId)` | Verified JWT subject or connected session identity | WebSocket session revalidation; server-derived account IDs. |
| `services/chatRealtime.js:81` | `ChatConversation.findOne({_id, ...accessFilter})` | WebSocket event IDs, required to be 24-hex strings | Conversation is now scoped to membership or permitted department access before loading. |
| `services/chatRealtime.js:85` | `ChatMessage.findOneAndUpdate({_id, conversation, sender, deliveredTo}, {$addToSet})` | WebSocket IDs, type/shape checked; identity from authenticated socket | Message receipt update is scoped to the conversation and excludes the current sender. |
| `services/chatRealtime.js:95` | `ChatConversation.findOne({_id, participants})` | WebSocket conversation ID | Presence acknowledgment is scoped to the authenticated participant. |
| `controllers/adminUserController.js:87-88,187-188` | `Role.find()`, `Department.find()` | No | Reference lists on administrator-only setup/user management routes. |
| `controllers/adminUserController.js:134` | `User.find({email: {$in: preparedEmails}})` | Imported rows, normalized and validated before this query | `$in` array is constructed from validated email strings; bulk import rate/row limits apply. |
| `controllers/adminUserController.js:180,184` | `User.find(userFilter)`, `countDocuments(userFilter)` | Search string from query, escaped before regex; filter fields fixed | Administrator-only, paged user list. |
| `controllers/adminUserController.js:229,346` | `Department.findById(departmentId)` | Validated admin-created/updated department ID | Department assignment lookup; administrator-only mutation. |
| `controllers/adminUserController.js:335` | `User.findById(id)` | Route ID checked as ObjectId | Administrator-only user update; role and verification safeguards follow. |
| `controllers/adminUserController.js:351` | `User.countDocuments({role:'admin', _id:{$ne:user._id}})` | Current database record ID | Prevents removal of the last administrator. |
| `controllers/adminUserController.js:374` | `Role.findOne({key:user.role})` | Stored user role | Resolves display name for a notification. |
| `controllers/adminExportController.js:23-32` | Ten collection `find()` calls | No filter input | Admin-only full-company export. See remaining risks: results are loaded into memory. |
| `controllers/adminOverviewController.js:113` | `Department.findById(departmentId)` | Query string validated as `all` or ObjectId | Admin-only report filter. |
| `controllers/adminOverviewController.js:117` | `User.find(departmentUserFilter)` | Department filter built from validated ID | Admin-only, organization/selected-department metrics. |
| `controllers/adminOverviewController.js:120-129` | Department, date-scoped attendance/leave/task/invoice/audit queries and a leave count | Dates and department come from validated query scalars; operators and fields are server-authored | Admin-only dashboard. Date/department scopes are applied in MongoDB; report intentionally aggregates a range. |
| `controllers/authController.js:23` | `Role.findOne({key:user.role})` | Stored account role | Display data for authenticated account. |
| `controllers/authController.js:71` | `User.find({role:'admin', isVerified:{$ne:false}})` | No | Finds notification recipients after signup; fixed role filter. |
| `controllers/authController.js:94` | `User.findOne({email})` | Validated and normalized sign-in email | Authentication lookup; email is a string, never a filter object. |
| `controllers/authController.js:113,142,173,197` | `User.findById(req.user.id)` | Authenticated user ID | Profile read/update/password actions are bound to the current account. |
| `controllers/authController.js:238` | `User.updateOne({_id:payload.sub}, {$inc:{tokenVersion:1}})` | Verified JWT subject | Logout revocation targets the current token subject. |
| `controllers/attendanceController.js:18-19,31-32` | `User.find()` for admin/HR and department manager recipients | Department ID from the signed-in user | Server-selected notification recipients. |
| `controllers/attendanceController.js:59,265,347` | `Attendance.findOne({user:req.user._id,dateKey})` | Authenticated account ID and server date | Current employee’s own attendance. |
| `controllers/attendanceController.js:63,86` | `User.find({department:req.user.department._id})` | Authenticated manager’s department | Builds department member IDs for manager-scoped lists. |
| `controllers/attendanceController.js:70,90-91` | Attendance `find` and count with a server-built role/department/date filter | Page values only from query; filter is server-built | Employee sees self; manager sees department; admin/HR see the selected workday. |
| `controllers/attendanceController.js:104` | `Attendance.findOne({user:userId,dateKey:{$lt:dateKey},checkInLocation:{$ne:null}})` | User ID/date passed internally from attendance calculation | Previous location for the current user, used to flag unusual travel. |
| `controllers/attendanceController.js:146-149` | Users, selected-month attendance, roles, and approved leave reads | Month string validated; no user-supplied filter object | Admin-only monthly report. It currently loads source rows before assembling the paged response; see remaining risks. |
| `controllers/attendanceController.js:289` | `Attendance.findOne({_id:attendanceId,user:req.user._id})` | Validated route ID plus authenticated account | Location correction is strictly self-owned. |
| `controllers/attendanceController.js:312` | `Attendance.findById(attendanceId)` | Validated route ID | Admin/HR/manager review route; manager department authorization is checked after loading the record and before any mutation/response. |
| `controllers/billingController.js:75-78` | Invoice `find`/count with `filter`; fixed aggregation pipeline | Search and status query strings; search is regex-escaped and status is allowlisted | Billing middleware limits access to admin/HR/manager/accounting roles or Accounts department. Current invoice records are organization-wide; there is no tenant field. |
| `controllers/billingController.js:126-127,158-159` | Account departments/users lookup with fixed role/department filters | No | Notification recipients after invoice creation/status change. |
| `controllers/billingController.js:134,147,165,176,191,196` | `Invoice.findById(invoice._id/invoiceId)` | Stored ID or validated route ID | Billing-authorized invoice operations. Global access within billing authorization is intentional in the current single-company model. |
| `controllers/billingController.js:78` | `Invoice.aggregate([{ $group: ... }])` | No request-built pipeline stages | Fixed invoice summary aggregation. |
| `controllers/chatController.js:23` | `ChatConversation.findOne({_id, ...getConversationAccessFilter(user)})` | Validated route ID; access filter uses authenticated user ID/department | Conversation ownership is now applied in the query. |
| `controllers/chatController.js:37-41` | Conversation `find`/count and message unread count | Authenticated user ID in participant and unread filters | Employee membership; admins may see department rooms. |
| `controllers/chatController.js:62` | `User.find(filter)` and count | Search is bounded and regex-escaped; filter uses authenticated role/department | Only verified colleagues allowed by chat policy. |
| `controllers/chatController.js:73` | `User.findOne({_id:userId,isVerified:true})` | Validated body ObjectId | Direct-chat target is checked against chat policy before opening a conversation. |
| `controllers/chatController.js:77,95` | `ChatConversation.findOneAndUpdate(fixed directKey or type/department filter, fixed update)` | Direct key/department composed from validated IDs | Unique conversation upsert after authorization. |
| `controllers/chatController.js:91,93` | Department/user lookups by validated department ID | Validated body ObjectId | Department room creation checks the actor’s allowed department before reading members. |
| `controllers/chatController.js:111,135` | Message `find`/count/cursor by an accessible conversation ID | Conversation ID comes from an authorized conversation record | History, export and message listing stay inside an authorized room. |
| `controllers/chatController.js:168` | `ChatMessage.updateMany(unreadFilter, {$addToSet: ...})` | Authenticated user ID and authorized conversation | Read receipts update only incoming unread messages in that room. |
| `controllers/chatController.js:187,189` | Message `findById` and conversation `updateOne` | IDs created/read from the current server operation | Persists and returns a message only after access to its conversation is established. |
| `controllers/chatController.js:191,204` | Department member list / department list | Current conversation department or authenticated role/department filter | Notification recipients or allowed room selector. |
| `controllers/emailController.js:22,26` | User `find`/count using `filter` | Search escaped; role/department accepted only as query strings; no operator-shaped values | Authenticated directory; recipients are selected by validated IDs. |
| `controllers/emailController.js:31,51` | Department `find` and User `find({_id:{$in:recipientIds},isVerified:{$ne:false}})` | IDs validated by request schema | Mail is sent only to verified recipients explicitly selected by the sender. |
| `controllers/emailController.js:92` | EmailLog `find`/count using sender-scoped filter | Pagination only | Sent-mail history is limited to the authenticated sender. |
| `controllers/leaveController.js:33,38-39` | Leave `find`/count with `ownFilter` and `queueFilter` | Authenticated ID and role/department are server-derived | Own requests are requester-scoped; approval queue is stage-scoped and manager department-scoped. |
| `controllers/leaveController.js:77,130` | User lookup for current/next reviewers | Server-derived role and request department | Notification recipients only. |
| `controllers/leaveController.js:82,97,143` | Leave `findById` for newly-created or validated route ID | No request filter objects | Action checks requester, pending state, hierarchy stage, and manager department before saving or responding. |
| `controllers/leaveController.js:168` | Leave `find`/count with approved/month-overlap filter | Month validated; filter fixed | Admin-only approved-leave archive. |
| `controllers/taskController.js:10,34` | Role lookups | Authenticated role / fixed hierarchy comparison | Role hierarchy and assignable-role lookup. |
| `controllers/taskController.js:40,54` | User lookups with role/verification/department filters | Role and department from authenticated actor | Task assignee choices limited by hierarchy and manager department. |
| `controllers/taskController.js:60-61` | Task `find`/count with `filter` | Filter built from signed-in role, user, department | Task lists are organization-wide for admin/HR, department/creator scoped for managers, and self-assignment scoped for employees. |
| `controllers/taskController.js:80` | `User.findById(assignedTo)` | Validated body ObjectId | Assignee is checked for verification, hierarchy, and department before task creation. |
| `controllers/taskController.js:92,119` | `Task.findById(task._id)` | Newly created/updated record ID | Response population after authorization. |
| `controllers/taskController.js:108` | `Task.findOne(taskFilter)` | Validated route ID; user ownership predicates for non-admin/HR | Status update query is now owner-scoped; admin/HR may manage any task. |
| `controllers/notificationController.js:10-11` | Notification `find`/counts with recipient | Authenticated account ID | User sees only their notifications. |
| `controllers/notificationController.js:25,31,41` | `findOneAndUpdate`, `exists`, `updateMany` with recipient | Validated ID plus authenticated account | Single/all read operations are recipient-scoped. |
| `controllers/organizationController.js:44-45` | Role/Department `find()` | No | Admin-only reference settings. |
| `controllers/organizationController.js:75,112` | Role/Department `findById` | Validated route ID | Admin-only deletion; references are checked before deletion. |
| `controllers/securityController.js:29,31,55,64,69` | Password-reset user/token reads, token consume, and token delete | Validated email/token; token lookup is by hash and expiry | Recovery pipeline is bound to one matched account and one-time token. |
| `controllers/securityController.js:80` | AuditEvent `find`/count | Pagination only | Admin-only audit history. |

## Remaining risks

- This is a single-company data model: invoices and administrator reports have no `tenantId`. Billing roles and admins can see company-wide records by design. Add tenant-scoped filters before introducing multiple organizations.
- The manager attendance-location review loads a record by validated ID and then enforces department membership before changing or returning it. A future denormalized department key on attendance could move that predicate into the initial query without a separate user lookup.
- Monthly attendance and full CSV exports load broad result sets into application memory. The monthly report slices its response after computing company-wide totals; exports are intentionally unpaged. These paths need bounded aggregation/streaming or explicit export limits as data grows.
- No user-controlled filter/update object is passed directly to Mongoose. Search and list filters are constructed from fixed keys; source query/body data is restricted to validated scalars or validated IDs.
