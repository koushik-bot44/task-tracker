# Orbit — architecture map

This map is for planning Orbit's end-to-end tests and its security review: what the business does, how requests flow, which data rules hold, and where trust is checked.
Every path:line below was checked against commit 9c3eafd. Paths are from the repository root; a bare `:n` is a line in the file named just before it.

**Uncommitted changes after 9c3eafd.** The working tree has uncommitted edits, and more were landing while this check ran (for example `lib/whatsapp.ts`, `app/api/assignment-groups/route.ts`, `components/work/work-record.tsx`); re-stamp the map once they are committed. Every cite in this map is still the 9c3eafd line. In the working tree, these cited files move:
- `lib/work/workflow.ts`: Stuck from Escalated now goes through IN_PROGRESS before WAITING (`lib/work/workflow.ts:78-82`); at 9c3eafd it got 409 (Data and invariants → Old four-word screens). Cites after `:79` move +2: `pathToStatus` `:68-89`, `stateAfterAssignment` `:97-101`, `TRANSITION_LABEL` `:104-114`, and `:105`, `:107`, `:108` become `:107`, `:109`, `:110`.
- `lib/session.ts`: `errorResponse` also answers Prisma P2002 with 409 "That has already been saved." and P2025 with 404 (`lib/session.ts:109-114`). `errorResponse` is `:105-117` and `route()` `:120-130`.
- `lib/validation.ts`: a new `orderKeySchema` (`lib/validation.ts:50-66`) checks every `orderKey` field. Cites before `:49` move +1 (`E164_RE` and `phoneInput` `:24-34`, `roleSchema` `:38`). Cites after `:48` move +19: `noteFileUrl` `:175-179`, `createCommentSchema` `:190-205`, `createTaskSchema` `:207-232` (`id` `:208`, `requesterId` `:214`, `siblingKey` `:231`), `updateTaskSchema` `:341-372` (`progress` `:360`, `deletedAt` `:361`, `deliverableUrl` `:365-370`), `parseBody` `:374-393`, `transitionSchema` `:396-405`, `assignSchema` `:406-412`, `noteSchema` `:415-425`.
- `lib/work/tasks.ts`: `moveOnce` now writes only while the task is still in the state it read, else 409 "Someone else moved this task just now." (`lib/work/tasks.ts:621-624`). Cites after `:621` move +3 (`applyLegacyStatus` `:649-658`, `deleteWork` `:663-679`).

## Business

### What Orbit is for

Orbit is a work tracker that one organisation runs for itself. A new organisation starts with one account, the CEO, and nine default departments: Development, Administration, Accounts, Operations, Research and Development, ERM, HR, Network Admins and Self (lib/default-departments.ts:7-17). The first sign-up makes both in one step (app/api/auth/bootstrap/route.ts:74-95). From there the CEO invites people, names heads of department, makes teams and projects, and raises tasks (app/api/auth/bootstrap/route.ts:27-34; components/today/setup-card.tsx:33-49). The CEO can rename, add or remove departments later (lib/default-departments.ts:1-6).

Every screen sits inside one frame: tabs down the left on a computer, along the bottom on a phone, with the bell and your face at the top (components/app-frame.tsx:53-127). The tabs are Today, Work, Departments, Calendar, People and Well Being, each shown only to the people it is for (components/app-frame.tsx:29-40).

### Who uses it

Highest first. Chain roles manage strictly lower ranks. The admin manages Manager and below, plus the admin account. Only the CEO manages the CEO account, their own included. A head or manager only manages people who are unplaced or in a department they run (lib/permissions.ts:150-186; components/people/person-sheet.tsx:24-42).

- **CEO (FOUNDER)**: sees and acts on everything (lib/roles.ts:18-22). Only the CEO has the set-up card, the Well Being tab, department deletion and setting a project's progress by hand (components/today/today-page.tsx:33; middleware.ts:60-66; app/api/departments/[id]/route.ts:88-92; components/project/project-tasks-page.tsx:38).
- **Co-founder (CO_FOUNDER)**: sees the shape of the company but opens only the projects he is on. He can invite people and place them in any department. He does not get the Today summary line (lib/roles.ts:24-31; lib/permissions.ts:188-198; app/api/today/route.ts:61).
- **Head of department (HOD)**: runs the department they head: its description, teams, projects and the people placed in it (lib/department-heads.ts:6-19; app/api/departments/[id]/route.ts:70; lib/work/org.ts:40-44; app/api/projects/route.ts:58, 73; lib/permissions.ts:194-206).
- **Manager (MANAGER)**: starts projects in any department, schedules meetings, and invites people into their own department (app/api/projects/route.ts:59; app/api/events/route.ts:34; lib/permissions.ts:194-206).
- **Team lead (TEAM_LEAD)**: reads the People list, ticks tasks done on Today, and changes who is on a team they lead. Cannot invite (lib/roles.ts:57-67; components/today/task-rows.tsx:151-152; lib/work/org.ts:46-51).
- **Member (RESOURCE, shown as "Team member")**: works on their own tasks. No People tab, and the tick on Today cannot be changed (lib/types.ts:550; components/app-frame.tsx:37; components/today/task-rows.tsx:152).
- **Admin (ADMIN)**: looks after accounts only. No work tabs; can open only People, Account and My space. Handles password-reset requests and gives positions up to Manager (components/app-frame.tsx:31-38; middleware.ts:42-58; components/people/people-page.tsx:131; components/people/person-sheet.tsx:26-27).
- **Person (PERSON)**: someone in Well Being, set up and run by the CEO. Signs in to one screen of their own and can open nothing else (components/login-form.tsx:52; middleware.ts:22-35).

### What the CEO sees each day

Today is the first screen: route `/`, app/(app)/page.tsx:7, component components/today/today-page.tsx. From top to bottom:

1. **Set up your organisation**, only while the organisation is new. Five steps, each ticked when done and linking to where it is done: Invite your people; Name the heads of department; Make teams where you need them; Start a project and add its people; Raise the first task (components/today/setup-card.tsx:33-49). The counts come from `GET /api/org/setup`, which answers the CEO only (app/api/org/setup/route.ts:12-23). The card goes away when all five are done, or when the CEO hides it; only that browser remembers the hiding (components/today/setup-card.tsx:23-30, 50-60).
2. **The summary line**, "N projects · N behind · N reviews this week". "Behind" links to Departments and "reviews" to Calendar (components/today/summary-line.tsx:8-22). The CEO and heads of department see it (app/api/today/route.ts:61-66).
3. **Your tasks**: the CEO's own open tasks, including tasks in no project, soonest due first (app/api/today/route.ts:32-45, 77-83). Tapping a row opens the task's record (components/today/task-rows.tsx:126).
4. **Meetings**: today's and tomorrow's, plus a later meeting when someone cannot make it and the CEO can move it (app/api/today/route.ts:94-103). Each card has "I'll be there" and "Can't", plus Postpone for whoever can move it (components/today/meeting-card.tsx:71-110).
5. **+**: opens the full New Task form, so a task does not need a project (components/today/today-page.tsx:47-59).

Away from Today, each evening at 18:00 IST the CEO, like anyone with something tomorrow, gets one message: tasks due tomorrow, how many are late, and tomorrow's meetings with reply links. It lands on the bell, and on push, email and WhatsApp where those are on; nothing to say means no message (vercel.json:4-5; lib/tomorrow.ts:8-12, 110-118; lib/notify.ts:83-141).

## Journeys

Each step names the screen: its route, then the component file.

### 1. A new organisation

1. **First run**: `/login` (app/login/page.tsx:9-10 → components/login-form.tsx). With no accounts the page reads "Set up the CEO account" and asks for a name, the setup passcode, an email and a password (components/login-form.tsx:72-153). "Create account" calls `POST /api/auth/bootstrap`, which checks the passcode, makes the CEO (FOUNDER) and the default departments in one serializable transaction, and signs the CEO in (app/api/auth/bootstrap/route.ts:61-64, 74-95, 106-117). Once any account exists it refuses (app/api/auth/bootstrap/route.ts:50-56).
2. **CEO**: lands on Today `/`, with the set-up card on top (components/today/today-page.tsx:33; components/today/setup-card.tsx).
3. **People**: `/people` (app/(app)/people/page.tsx:4 → components/people/people-page.tsx). Every department shows as a card, empty ones too, with the CEO above them under Company (components/people/people-page.tsx:62-99). Tap **Invite** (components/people/people-page.tsx:124-128).
4. **Invite several people, with positions and departments**: the "Invite people" sheet (components/people/invite-sheet.tsx). Each row is one person with Name, Email, Position and Department (components/people/new-people-rows.tsx:88-172). A person can have more than one email; the first one gets the invite. Position left alone means Team member (components/people/new-people-rows.tsx:14, 145).
   - The CEO, the co-founder and the admin may choose "Not placed yet". A head or a manager must pick a department they run (components/people/invite-sheet.tsx:37-43, 56; lib/permissions.ts:188-206), unless they run no department, in which case they may leave people unplaced (lib/permissions.ts:201-203; components/people/invite-sheet.tsx:56).
   - Sending calls `POST /api/users/invite`, up to 50 people at once (app/api/users/invite/route.ts:22-33). Every row is checked before any account is made (lib/invite-people.ts:24-51), then each account is made as Invited (lib/invite-people.ts:54-62). The checks are listed under Data and invariants.
5. **Set-password links**: after sending, the sheet shows each person's link with "Send on WhatsApp" and "Copy link"; an email goes too when email is set up (components/people/invite-sheet.tsx:79-100; components/people/invite-links.tsx:47-88). A link works once, for 72 hours (lib/invite.ts:16; components/people/invite-links.tsx:36).
   - The person opens `/invite/<token>` (app/invite/[token]/page.tsx:6 → components/set-password-form.tsx), sets a password and is signed in; the account becomes Active (app/api/invite/[token]/accept/route.ts:53-65).
   - A dead link says whether it is not valid, expired or already used (app/api/invite/[token]/accept/route.ts:38-51; components/set-password-form.tsx:156-174).
6. **Heads**: someone invited as Head of department becomes head of the department they are placed in, if it has no head yet (lib/department-heads.ts:37-47; components/people/new-people-rows.tsx:162).
   - The CEO can also pick the head from Departments `/projects` → a department → Edit (components/projects/department-view.tsx:86-90 → components/sheets/department-sheet.tsx:147-158). Invited heads are offered there too (components/sheets/department-sheet.tsx:49-56).
   - Moving a head, changing their position or disabling them removes the headship (app/api/users/[id]/route.ts:145-150).
7. **Teams**: People → a department → **+ Team** (components/people/teams-section.tsx:27-32). The team sheet asks for a team name, a lead and who is on it (components/people/teams-section.tsx:105-165). The CEO or that department's head makes teams (components/people/people-page.tsx:164; lib/work/org.ts:40-44).
8. **Projects**: Departments `/projects` (app/(app)/projects/page.tsx:7 → components/projects/projects-page.tsx) → **New project** (components/projects/projects-page.tsx:225-233) → components/sheets/new-project-sheet.tsx. Saving opens the project at `/project/<slug>` (components/sheets/new-project-sheet.tsx:139-140). Journey 3 has the detail.
9. **Tasks**: Work `/work` → **New** (components/work/work-page.tsx:285-288), or the + on Today (components/today/today-page.tsx:47-59). Both open components/work/new-work-sheet.tsx. Journey 2 has the detail.

Departments can be renamed at any time from Edit. Only the CEO can delete one, and only when it holds no projects, people or teams (components/sheets/department-sheet.tsx:91-101; app/api/departments/[id]/route.ts:88-115).

### 2. A day's work on a task

1. **Login**: `/login` → components/login-form.tsx. "Sign in" calls `POST /api/auth`. Most people land on Today, an admin on People, a Well Being person on their own screen (components/login-form.tsx:34, 52). "Forgot password?" leads to `/forgot` (components/login-form.tsx:178-185; app/forgot/page.tsx:11).
   - **Forgot password**: `/forgot` posts the address to `POST /api/password-reset/request` (app/forgot/page.tsx:21-25). For an active account that is not disabled it files one pending request and gives every admin a reset.requested bell line and push; the answer is the same either way (app/api/password-reset/request/route.ts:17, 46-68).
   - The admin sees the queue on People (components/people/people-page.tsx:131 → components/people/reset-requests.tsx:24, 29). "Send reset link" emails a 72-hour set-password link and marks the request resolved (app/api/password-reset/[id]/resolve/route.ts:32-41). The link is not returned to the admin (app/api/password-reset/[id]/resolve/route.ts:43), so without SMTP the person gets nothing and the admin sees "Cleared, but the email didn't send." (components/people/reset-requests.tsx:33).
   - Setting a password through that link does not end the person's existing sessions (app/api/invite/[token]/accept/route.ts:53-56).
2. **Today**: `/` → components/today/today-page.tsx (see Business).
3. **Work**: `/work` (app/(app)/work/page.tsx:7 → components/work/work-page.tsx). The tabs run widest first: All (CEO only), Departments, Individual, Your team's work, Assigned by you, Your work (components/work/work-page.tsx:162-177). The CEO starts on All, everyone else on Your work (components/work/work-page.tsx:116). On a phone the tabs scroll sideways in their own row (components/work/sn.tsx:38-43). "Show" picks Work in progress, Awaiting meeting, Overdue, Highest priority first, On Hold, Resolved, Closed or All (components/work/work-page.tsx:24-33). Each page shows 50 rows (components/work/work-page.tsx:77).
4. **A task's record**: tap its number or description (components/work/task-table.tsx:115-122) → `/work/<number>` (app/(app)/work/[number]/page.tsx:7 → components/work/work-record.tsx). The title-bar buttons are the moves the server allows this person (components/work/work-record.tsx:109-111, 192-196).
5. **Assign**: tap "Assigned to" or "Assignment group" (components/work/work-record.tsx:267-277). The "Who is doing this?" sheet asks for a team, then a person (components/work/work-sheets.tsx:26-110); invited people are offered, and show "(invited)" only when the task has no team and no project (components/work/work-sheets.tsx:49-57). Once someone holds the task it is Work in progress at once (lib/work/workflow.ts:89-99; lib/work/tasks.ts:503-506). "+ Give this to more people" makes a copy for each extra person (components/work/work-record.tsx:303-307; components/work/work-sheets.tsx:189-283). Trace 1 follows this press end to end.
6. **Notes and files**: the Notes tab holds the history and a box to write in (components/work/work-record.tsx:369-381; components/work/activity-stream.tsx:128). The box attaches several files, takes a photo on a phone, and mentions someone with @ (components/work/activity-composer.tsx:102-143). The Attachments tab lists every file; people working on the task can pin a file, and pinned files show under Description (components/work/work-record.tsx:348-366, 383-391; components/work/task-files.tsx:170-177).
7. **A meeting from the task**: the Meetings row shows a small month with a dot on each meeting day (components/work/work-record.tsx:246-249; components/work/task-meetings.tsx:42-47). A manager or above taps the calendar symbol, or a day and then "+ Meeting on …" (components/work/task-meetings.tsx:50, 94-104, 158-164). This opens components/calendar/schedule-meeting-sheet.tsx with the task's people ticked (components/work/task-meetings.tsx:68-81, 167-174). Only the task's people and the organiser, active accounts only, can be invited (app/api/events/route.ts:53-59; lib/task-meetings.ts:10-27). The meeting appears on their Today with a link back to the task (components/today/meeting-card.tsx:61-66).
8. **On Hold**: asks "Waiting for what?" (components/work/work-record.tsx:112-116, 397; components/work/work-sheets.tsx:112-143). The server refuses without a reason (lib/work/tasks.ts:606-607). "Start Work" takes it off hold (lib/work/workflow.ts:20, 105).
9. **Resolve**: "Mark Complete" moves the task straight to Resolved (lib/work/workflow.ts:107; components/work/work-record.tsx:112-116), recorded as Completed (lib/work/tasks.ts:166-169). It is offered from Work in progress or Escalated (lib/work/workflow.ts:19, 21).
10. **Close**: "Close" ends it (lib/work/workflow.ts:22, 108). A closed or canceled task can be reopened after a confirm (lib/work/workflow.ts:23-24; components/work/work-record.tsx:399).
   - **Who gets steps 8-10** (canTransitionTask, lib/work/access.ts:177-204). The CEO and the department's head may make every move the table allows (lib/work/access.ts:179-180). On Hold: the holder, the task's team, a project lead, a department lead, or anyone on the project (lib/work/access.ts:192-194). Mark Complete on a project task: only a lead or above who is on or can see the project, a department lead, or the team's lead (lib/work/access.ts:185, 195-196); anyone else gets "Only a team lead or above marks a task done." (lib/work/tasks.ts:603). On any other task the holder and the team may too (lib/work/access.ts:197). Close: the requester, the team's lead, a project lead or a department lead, never the holder as such (lib/work/access.ts:198-199). Reopen: those people plus the holder (lib/work/access.ts:200-201).

### 3. Projects and milestones

1. **Departments**: `/projects` → components/projects/projects-page.tsx lists the departments. Tapping one opens `/projects?d=<id>` (components/projects/projects-page.tsx:95) → components/projects/department-view.tsx, with All / Mine / Behind, the project cards, and the department's task table (components/projects/department-view.tsx:112-138).
2. **New project**: the server lets the CEO, the co-founder and managers start one in any department, and a head only in a department they head (app/api/projects/route.ts:63, 73-75); the screen offers it only to the CEO, managers and heads (components/projects/projects-page.tsx:47-52). The sheet asks for Name, Priority (P1/P2/P3), Department (when not already chosen), Lead, People, "Someone not on Orbit yet", Start and Deadline (components/sheets/new-project-sheet.tsx:184-320). Invite rows are checked before the project is made (app/api/projects/route.ts:84-98); new people are placed in the project's department (lib/project-invites.ts:82). If anyone was invited, their links show before "Open the project" (components/sheets/new-project-sheet.tsx:147-169).
3. **The project page**: `/project/<slug>` (app/(app)/project/[slug]/page.tsx:7 → components/project/project-tasks-page.tsx) shows the header (components/project/project-header.tsx), every task of the project in a table with New, and a Project notes drawer (components/project/project-tasks-page.tsx:79-134). The CEO taps the progress bar to set the number by hand (components/project/project-header.tsx:111-119; components/sheets/set-progress-sheet.tsx:12-16).
4. **Add people**: "Add people" in the header (components/project/project-header.tsx:83-92) → components/sheets/add-people-sheet.tsx. Find someone and tap Add, or Remove a member; invited people are listed (components/sheets/add-people-sheet.tsx:21-24, 155-190). Only people who can make accounts see the rows for inviting someone new; anyone else who runs the project adds people already on Orbit (components/sheets/add-people-sheet.tsx:102-106, 193-214). The server lets only the people running the project add or remove people (app/api/projects/[id]/members/route.ts:61, 131).
5. **The lead runs it**: a project is run by the CEO, the department's head, the owner, the lead, and any member marked as able to manage (lib/project-people.ts:98-108; components/project/can-manage.ts:15-29). Running it gives Add people, the look, the priority, and the deadline and details sheet (components/project/project-header.tsx:64-67, 83-109, 125-126, 162).
6. **Milestones**: since 2026-09-09 (work model, commit 0248ed1) the project page shows its tasks where the milestone boxes were (components/project/project-tasks-page.tsx:26-31). The old screen, components/project/project-page.tsx, is imported by no file, so its boxes and its add, plan, move-review and review sheets never show. The API remains: `GET`/`POST /api/milestones` (app/api/milestones/route.ts:16, 30), `PATCH`/`DELETE /api/milestones/<id>` (app/api/milestones/[id]/route.ts:26, 56), `POST /api/milestones/<id>/outcome` (app/api/milestones/[id]/outcome/route.ts:25). Three places still read milestones: Project notes can switch to a milestone's notes (components/project/project-tasks-page.tsx:116-133); the Today summary counts reviews this week (app/api/today/route.ts:88-91); the Calendar marks review meetings (components/calendar/chips.tsx:12, 24).

### 4. People and invites

1. **People**: `/people` → components/people/people-page.tsx, for team leads and above and the admin (lib/roles.ts:57-60). A search box, then Company, then each department with its head first and its teams, then "Not placed yet" (components/people/people-page.tsx:62-99, 140-185). Rows show the position, "Invited" or "Disabled" (components/people/people-page.tsx:227-234). You can open a row when your rank is higher, when you are the admin and the row is Manager or below or the admin account, or when you are the CEO opening your own (components/people/person-sheet.tsx:34-42). The server also limits a head or manager to people unplaced or in a department they run (lib/permissions.ts:160-167).
2. **Invite people**: as in journey 1, step 4. The same rows appear in Add people, New project and New Task (components/people/new-people-rows.tsx:46-53; components/sheets/add-people-sheet.tsx:202-208; components/sheets/new-project-sheet.tsx:295; components/work/new-work-sheet.tsx:321). Only People → Invite asks for a department; the other three place new people in the project's or the task's department (components/people/invite-sheet.tsx:120; lib/project-invites.ts:82; components/work/new-work-sheet.tsx:117-119).
3. **Share invite link**: open an invited person. "Share invite link" makes a fresh link without sending an email; "Resend invite" emails a fresh link; either one stops the old link working. "Cancel invite" is also there (components/people/person-sheet.tsx:208-241, 428-439; app/api/users/[id]/resend/route.ts:17-18, 26-27).
4. **The person sheet** (components/people/person-sheet.tsx): Name, as often as needed (:129-136, 274-298); the sign-in email, changeable for anyone except yourself (:138-146, 300-329); Department (:148-159, 332-349), with the server checking you may place them there (app/api/users/[id]/route.ts:121); Role, from the positions below your own, or up to Manager for the admin (components/people/person-sheet.tsx:24-32, 95-97, 161-167, 351-369); WhatsApp number (:169-180, 371-397); and Set a password, Reset password, Disable account and Delete account (:399-479). Reset password is hidden for yourself (components/people/person-sheet.tsx:442-447) and the PATCH reset refuses it (app/api/users/[id]/route.ts:61). Set a password is hidden for yourself and on the CEO's row (components/people/person-sheet.tsx:400), but `POST /api/users/<own id>/password` still lets the CEO and the admin set their own password without proving the old one (app/api/users/[id]/password/route.ts:22-38; lib/permissions.ts:168-181).
5. **Account → Sign-in email**: face menu → Account (components/app-frame.tsx:214) → `/settings/account` (app/(app)/settings/account/page.tsx:4 → components/settings/account-page.tsx). Once you change the address the card asks for your password (components/settings/account-page.tsx:133-187); saving calls `POST /api/users/me/email` (lib/hooks/use-users.ts:115-116). The server checks the password, the address shape and that nobody else has it; open sessions stay signed in (app/api/users/me/email/route.ts:17-44). This is how the CEO moves to a real address, since nobody ranks above the CEO (components/settings/account-page.tsx:133-137).

### 5. Calendar

1. **Calendar**: `/calendar` (app/(app)/calendar/page.tsx:7 → components/calendar/calendar-view.tsx). A wide screen shows a month grid; a phone shows a strip of days and the month's list (components/calendar/calendar-view.tsx:163-280). It shows only project deadlines, review meetings and other meetings (components/calendar/chips.tsx:7-16).
2. **Filter**: "All projects", or tap projects to show only those; the browser remembers the choice (components/calendar/project-filter.tsx:6-13; components/calendar/calendar-view.tsx:48-66).
3. **A day**: tap it → components/calendar/day-panel.tsx, with Meetings and Deadlines (components/calendar/day-panel.tsx:62-87). Each meeting shows everyone's replies and your own "I'll be there" or "Can't"; whoever can move it also sees Postpone (components/calendar/day-panel.tsx:108-111, 203, 219-240).
4. **Schedule meeting**: managers and above (components/calendar/calendar-view.tsx:46, 147-156; app/api/events/route.ts:34) → components/calendar/schedule-meeting-sheet.tsx. "About?" offers A project, A department, Everyone or People and fills in the faces, then asks when and what; the same sheet edits or cancels a meeting (components/calendar/schedule-meeting-sheet.tsx:21-38, 219, 250). Everyone on the meeting except its organiser, and only accounts that are not disabled, gets a bell line (lib/notify.ts:159-178, 193-206).
5. **Can't**: tells the organiser, from the app or from the emailed reply link `/r/<token>` (app/api/events/[id]/reply/route.ts:40-41; app/r/[token]/page.tsx:10-15, 35-43).

### 6. Well Being

1. **The tab**: CEO only (components/app-frame.tsx:38; app/api/users/me/route.ts:12-18). Route `/routine` (app/(app)/routine/page.tsx:6 → components/routine/routine-page.tsx). Other work accounts are sent to Today (an admin to /people, a PERSON to /person), and the API refuses them (middleware.ts:22-35, 46-66; lib/session.ts:66-72; app/api/routine/route.ts:22, 65).
2. **Add a person**: with no person yet, the page asks for their name, login email and password (components/routine/routine-page.tsx:136-140, 146-178). Each owner can have one person (app/api/routine/route.ts:67-71).
3. **Run the week**: switch between Summary and Tracker (components/routine/routine-page.tsx:224-256). The person bar edits name, login email and password, or removes them (:435-487). Arrows move between weeks (:415-428). Tracker holds the habit grid, the house rules, their tasks, a reminder card and weight (:265-271); a reminder reaches the person's bell and phone (lib/routine.ts:318-324; lib/notify.ts:14). "Monitoring managers" is switched off (components/routine/routine-page.tsx:276-277).
4. **The person's own screen**: they sign in and land on `/person` (components/login-form.tsx:52; app/person/page.tsx:6 → components/routine/person-screen.tsx) and cannot open anything else (middleware.ts:22-35). Tabs: Tasks, Habits, Rules (components/routine/person-screen.tsx:53-57). A reminder shows once (components/routine/person-screen.tsx:102-107; app/api/routine/kid/route.ts:44-49). They mark days but never see a score (components/routine/weekly-grid.tsx:80-86). Sign out is on the screen (components/routine/person-screen.tsx:199).

### 7. My space

1. **Open it**: face menu → "My notes" (components/app-frame.tsx:213) → `/my-space` (app/(app)/my-space/page.tsx:7 → components/my-space/my-space.tsx).
2. **What it holds**: the person's private departments, projects and tasks, which nobody else can see (components/my-space/my-space.tsx:24-31, 50-52). Make a department, then a project inside it, then tasks in the tree (components/my-space/my-space.tsx:306, 390, 445); an empty space says what to do first (:469-477).
3. **Prompt**: team members also get a Prompt button: one box whose first line becomes a private task in a project they pick (components/my-space/my-space.tsx:41, 55-64; components/my-space/prompt-composer.tsx:11-17).
4. **Who can open it**: every work account and the admin; a Well Being person cannot (middleware.ts:22-35, 46-52).

### 8. The bell

1. **Where**: the top bar on every screen (components/app-frame.tsx:96 → components/notifications/notification-bell.tsx). A red number shows how many are unread (components/notifications/notification-bell.tsx:108-112). `GET /api/notifications` sends the 30 newest active lines and the snoozed ones (app/api/notifications/route.ts:40-62).
2. **Read**: tapping a line opens its page and marks it read; "Mark all read" clears the number (components/notifications/notification-bell.tsx:78-82, 119-128).
3. **Snooze**: the clock on a line opens "Snooze until", set one hour ahead; the time must be in the future (components/notifications/notification-bell.tsx:84-96, 162-211; app/api/notifications/[id]/snooze/route.ts:44-47). A snoozed line leaves the list and the count until then, sitting under "Snoozed (N)" with Unsnooze (app/api/notifications/route.ts:35-39; components/notifications/notification-bell.tsx:218-258; app/api/notifications/[id]/snooze/route.ts:39-41). Nobody can snooze someone else's line (app/api/notifications/[id]/snooze/route.ts:29-36). The line comes back to the list and the count on time without the cron, because `GET /api/notifications` already treats a past snooze time as active (app/api/notifications/route.ts:43-48). The daily cron (03:00 UTC, vercel.json:8-9) only clears readAt and pushes again (app/api/cron/snooze-wake/route.ts:53-65), so a line snoozed after it was read comes back still read, turns unread at the next run, and its push can come up to a day late.
4. **Types**:

| Type | When | Written at |
|---|---|---|
| work.created | New work for your team, or someone opened a task for you | lib/work/events.ts:100-115 |
| task_given | A task is given to you (also push, email, WhatsApp) | lib/work/events.ts:117-125; lib/messages.ts:54 |
| work.reassigned | A task is no longer yours | lib/work/events.ts:126-137 |
| task_note | A note on a task you asked for or hold (also push, email, WhatsApp) | lib/work/events.ts:139-145; lib/messages.ts:74 |
| work.team-note | A team note | lib/work/events.ts:149-156 |
| work.mention | Someone mentioned you | lib/work/events.ts:225-236 |
| work.priority | Your task was raised to Critical or High | lib/work/events.ts:161-166 |
| task_resolved | A task you asked for is resolved (also push, email, WhatsApp) | lib/work/events.ts:178-193; lib/messages.ts:102 |
| work.status | Resolved, closed, canceled, reopened, on hold, escalated or started | lib/work/events.ts:168-217 |
| event.created, event.moved, event.updated, event.cancelled | A meeting you are on changed (bell only) | lib/notify.ts:180-204 |
| meeting.cant | Someone can't make your meeting | app/api/events/[id]/reply/route.ts:40-41; app/r/[token]/page.tsx:36-37 |
| tomorrow | The evening-before message: tomorrow's meetings, tasks due tomorrow, overdue count; resendForMeeting also sends a "Moved:" one for a single meeting (also push, email, WhatsApp) | lib/messages.ts:142; lib/tomorrow.ts:114, 149-153; lib/notify.ts:100-108 |
| review_result | A milestone review's outcome (also push, email, WhatsApp) | lib/messages.ts:173; app/api/milestones/[id]/outcome/route.ts:18-24, 60-72 |
| routine.reminder | The CEO's reminder to a Well Being person | lib/routine.ts:318-324 |
| routine.invited | An invite to monitor a Well Being (switched off on screen) | app/api/routine/collaborators/route.ts:44-50 |
| reset.requested | Someone forgot their password (goes to the admin) | app/api/password-reset/request/route.ts:58-66 |

5. **Channels**: bell only; bell plus phone push; or, for five messages (task given, task note, task resolved, tomorrow, review result), bell, push, email and WhatsApp, each channel following its own switch (lib/messages.ts:14; lib/notify.ts:83-141). Invited people who have not signed in yet get the bell line only (lib/notify.ts:91-93). The switches are in Account → Notifications (components/app-frame.tsx:215; components/settings/notifications-row.tsx:16-20). Architecture §9 says what turns each channel on.

### Found while checking

- **Invited people can't be picked for a team.** The team sheet lists Active people only (components/people/teams-section.tsx:77), though the server accepts invited people (lib/work/org.ts:74-77). New project's Lead and People lists are Active-only too (components/sheets/new-project-sheet.tsx:20-23, 103-108).
- **"Mark Complete" never asks how the task was resolved.** A "How was it resolved?" sheet exists, but nothing opens it (components/work/work-sheets.tsx:145-178; components/work/work-record.tsx:112-116).
- **One page, two names.** The menu and the top bar say "My notes"; the page heading says "My Space" (components/app-frame.tsx:150, 213; components/my-space/my-space.tsx:49).
- **Wrong empty text on Calendar.** It mentions task dates, which the calendar does not show (components/calendar/calendar-view.tsx:251; components/calendar/chips.tsx:15-16).
- **Old comments on Well Being** still call it a manager feature (lib/roles.ts:14-16; components/routine/routine-page.tsx:23); the code allows the CEO only (lib/session.ts:66-72).
- **Tab count.** The frame's comment says five tabs; there are six (components/app-frame.tsx:22, 33-38).

## Architecture

Orbit is one Next.js 14 app (`package.json:50`) using the app router. It runs on Vercel and stores its data in Postgres through Prisma (`package.json:42`, `prisma/schema.prisma:5-12`). Sessions are signed tokens made with jose (`package.json:48`). The screens only hide buttons they should not show; every real permission check runs on the server, inside the route handlers (`lib/permissions.ts:1-7`).

### 1. Pages

Every page under `app/(app)` is wrapped in `AppFrame` (`app/(app)/layout.tsx:1-6`), which draws the tabs and is always rendered fresh (`force-dynamic`). `app/(app)/template.tsx:10-22` fades the page in on every navigation. The tab labels and who sees each tab are set in `components/app-frame.tsx:33-38`.

Above every page, `/login`, `/invite`, `/r` and `/person` included, the root layout (`app/layout.tsx:69-84`) wraps the page in `Providers`, which holds the React Query client and toasts (`components/providers.tsx:7-29`), registers `/sw.js` (`components/pwa/service-worker.tsx:17`) and injects two inline scripts (`app/layout.tsx:53-67`, `:75-76`). `public/sw.js` precaches the app shell (`:11-23`), answers page navigations network-first with an offline page as the only fallback (`:40-44`), shows push messages (`:50-62`) and opens or focuses the app on a notification click (`:64-78`).

| Route | Page file | Component | Notes |
|---|---|---|---|
| `/` | `app/(app)/page.tsx:7` | `TodayPage`, `components/today/today-page.tsx:22` | Tab "Today". The CEO also sees `SetupCard` (`:33`). The + button opens `NewWorkSheet` (`:58-59`). |
| `/work` | `app/(app)/work/page.tsx:7` | `WorkPage`, `components/work/work-page.tsx` | Tab "Work". |
| `/work/[number]` | `app/(app)/work/[number]/page.tsx:7` | `WorkRecord`, `components/work/work-record.tsx` | One task record. |
| `/projects` | `app/(app)/projects/page.tsx:7` | `ProjectsPage`, `components/projects/projects-page.tsx` | The tab is labelled "Departments" (`components/app-frame.tsx:35`). |
| `/project/[slug]` | `app/(app)/project/[slug]/page.tsx:7` | `ProjectTasksPage`, `components/project/project-tasks-page.tsx` | One project. |
| `/calendar` | `app/(app)/calendar/page.tsx:7` | `CalendarView`, `components/calendar/calendar-view.tsx` | Tab "Calendar". |
| `/people` | `app/(app)/people/page.tsx:4` | `PeoplePage`, `components/people/people-page.tsx` | The tab shows only for roles that may list people (`components/app-frame.tsx:37`). The Invite button is at `components/people/people-page.tsx:125-126`. |
| `/routine` | `app/(app)/routine/page.tsx:6` | `RoutinePage`, `components/routine/routine-page.tsx` | Tab "Well Being". CEO only (`middleware.ts:61-66`). |
| `/my-space` | `app/(app)/my-space/page.tsx:7` | `MySpace`, `components/my-space/my-space.tsx` | Has no tab. |
| `/settings/account` | `app/(app)/settings/account/page.tsx:4` | `AccountPage`, `components/settings/account-page.tsx` | Includes the Sign-in email card (`:138-187`). |

These pages sit outside the group, and the middleware treats them differently.

| Route | File | What it does |
|---|---|---|
| `/login` | `app/login/page.tsx:9-10` | The server counts users. With no users it shows "Set up the CEO account" (`components/login-form.tsx:73`), which posts to `/api/auth/bootstrap`. Otherwise the form posts to `/api/auth` (`:34`). |
| `/forgot` | `app/forgot/page.tsx:21` | Posts to `/api/password-reset/request`. |
| `/invite/[token]` | `app/invite/[token]/page.tsx:6` | `SetPasswordForm`. A dead link shows the state the server returns (`components/set-password-form.tsx:61-64`). |
| `/person` | `app/person/page.tsx:6` | `PersonScreen`: the only page a Well Being PERSON login can open. |
| `/r/[token]` | `app/r/[token]/page.tsx:16-47` | Meeting reply link. The signed token is the permission; the page writes the reply itself. |

Old addresses redirect to current pages (`next.config.mjs:6-18`).

### 2. `middleware.ts`

The middleware verifies the session token's signature and reads its role, and only redirects or walls. It never reads the database (`middleware.ts:20`), so a disabled account or a changed sessionVersion still passes it and is refused by the route gate (`lib/session.ts:29-32`). The token's role drives only these walls; routes read the role from the database (Trust boundaries §1).

| Step | Rule | Lines |
|---|---|---|
| Skipped | `_next/static`, `_next/image`, `favicon.ico`, `manifest.webmanifest`, `sw.js`, `offline.html`, and any path ending in an image or font extension (svg, png, jpg, jpeg, gif, webp, ico, woff, woff2), `/api/*` included. Such a request never reaches the PERSON or ADMIN walls (`middleware.ts:22-59`), so the route's own gate is its only check. | `middleware.ts:84-88` (matcher `:86`) |
| Always through | `/api/auth`, `/api/auth/*` and `/login`. This is how a PERSON can still sign out. | `:16-18` |
| Read token | The `orbit_session` cookie is read through `readSessionToken`. | `:20` (`lib/auth.ts:53-72`) |
| **PERSON wall** | A PERSON reaches only `/person` and `/api/routine/kid*`. Any other API answers 403 JSON (`:27-29`). Any other page redirects to `/person`. | `:22-35` |
| Not a PERSON | Anyone else opening `/person` is sent to `/`. | `:36-41` |
| **ADMIN wall** | Pages only: an ADMIN may open `/people`, `/people/*`, `/settings*`, `/my-space` and `/login`; anything else redirects to `/people`. APIs are not walled here; the route gates refuse the admin instead (`lib/project-visibility.ts:24-26`, `lib/work/access.ts:54-56`). | `:46-59` |
| Well Being | `/routine*` for anyone but FOUNDER redirects to `/`. The ADMIN wall runs first, so an admin lands on `/people`. | `:61-66` |
| No session, public | `/login`, `/api/auth`, `/api/cron`, `/invite`, `/api/invite`, `/forgot`, `/api/password-reset/request` and `/r`, each as its exact path or anything below it. | `:10`, `:70-72` |
| No session, other API | `401 {"error":"Unauthorized"}`. | `:74-76` |
| No session, other page | Redirect to `/login`. | `:78-81` |

### 3. The gates (`lib/session.ts`)

Every gate loads the user from the database on each request and refuses a missing, disabled or out-of-date session with 401 (`lib/session.ts:24-35`). A token whose version no longer matches is refused (`:31-32`). Setting a password by hand, a People reset or a change from Account bumps `sessionVersion` (`app/api/users/[id]/password/route.ts:36`; `app/api/users/[id]/route.ts:142`; `app/api/users/me/password/route.ts:45`). Accepting an invite or an admin-issued reset link does not (`app/api/invite/[token]/accept/route.ts:53-56`), so older sessions survive it (Data and invariants → `sessionVersion`).

| Gate | Who gets through | Lines |
|---|---|---|
| `requireUser` | Any signed-in account except PERSON (403). | `lib/session.ts:45-51` |
| `requirePerson` | PERSON only. | `:54-60` |
| `requireManager` | **FOUNDER only**, despite the name ("Only the CEO has Well Being."). | `:66-72` |
| `requireProjectAuthority` | FOUNDER, CO_FOUNDER, HOD, MANAGER. **No route calls it at 9c3eafd.** | `:76-82` |
| `requireAdmin` | ADMIN only. | `:85-91` |
| `requireAccountAdmin` | FOUNDER, CO_FOUNDER, HOD, MANAGER, ADMIN (`lib/roles.ts:47-48`, `:66-67`). | `lib/session.ts:96-102` |
| cron secret | The header must be `Authorization: Bearer <CRON_SECRET>`, else 401. | `app/api/cron/tomorrow/route.ts:17-21` |
| public | No gate. Sign-in, bootstrap and reset requests are rate-limited per IP address (`lib/login-attempts.ts:29`, `:36`). | — |

`route()` turns a thrown `HttpError` into a JSON answer; anything unexpected becomes a 500 (`lib/session.ts:105-124`). In the uncommitted working tree a Prisma P2002 becomes 409 "That has already been saved." and P2025 becomes 404 (`lib/session.ts:109-114`; `errorResponse` `:105-117`, `route()` `:120-130` there).

### 4. API routes (105 `route.ts` files)

Each path is the file `app/api<path>/route.ts`. Line numbers in the Gate and Also checks columns are in that file unless another file is named. Most `requireUser` routes run a second check in the body that decides who really gets in, so testers should read the Also checks column.

`loadScope` refuses PERSON and ADMIN with 403 (`lib/work/access.ts:54-56`), and so does `visibleProjectIds` (`lib/project-visibility.ts:21-26`). Any route that calls either one is closed to the admin.

#### Sign-in, first run, invites, password reset

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/auth` | POST, DELETE | public, rate-limited (`:35-45`) | Any of the person's addresses signs in. A disabled or PENDING account looks like a wrong password (`:51-63`). DELETE clears the cookie (`:89-93`). |
| `/api/auth/bootstrap` | POST, GET | public, `APP_PASSCODE` (`:61-64`), rate-limited (`:39-48`) | 410 once any user exists (`:50-56`). Makes the FOUNDER (`:79`) and the default departments (`:83-91`) in one Serializable transaction (`:74-95`). GET returns `needsBootstrap` (`:122-125`). |
| `/api/invite/[token]/validate` | GET | public | 404 for an unknown token. 410 for a consumed or expired one (`:24-28`). A live token also returns the person's name, email and role (`:30-35`). |
| `/api/invite/[token]/accept` | POST | public | A password under 8 characters, or a trivial one, gets 400 (`:15`, `:18-22`, `:32-34`). A dead link answers 410 with a `state`: `unknown` (also sent for a switched-off account), `expired` or `consumed` (`:40-51`). The link works once (`:47-51`) and signs the person in (`:59-65`). |
| `/api/password-reset/request` | POST | public, rate-limited (`:27-31`) | Always gives the same answer (`:17`). Files one pending request and alerts the admins (`:46-68`). |
| `/api/password-reset` | GET | `requireAdmin` (`:10`) | The pending queue. |
| `/api/password-reset/[id]/resolve` | POST | `requireAdmin` (`:18`) | Issues a set-password link (`:32-36`). |

#### Cron

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/cron/tomorrow` | GET | cron secret (`:17-21`) | Runs `sendTomorrow` (`:25`). `?now=` lets a test rig pick the evening (`:22-24`). |
| `/api/cron/snooze-wake` | GET | cron secret (`:35-39`) | Wakes snoozed notifications (`:41-66`), then sweeps unused stored files (`:68-73`). |

#### People and accounts

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/users` | GET, POST | `requireUser` (`:31`, `:82`) | GET: `assertCanListUsers` (`:32`), then the department scope (`:40-53`). POST: `assertCanCreateUserWithRole` (`:87`), at most one admin (`:88-90`), `assertCanPlaceInDepartment` (`:118`), `syncDepartmentHead` (`:133`). |
| `/api/users/invite` | POST | `requireUser` (`:28`) | Up to 50 rows (`:22-23`). Each row takes a position from CO_FOUNDER to RESOURCE, or none (`:18`). Calls `invitePeople` (`:31`), which checks every row (`lib/invite-people.ts:42-51`). |
| `/api/users/[id]` | PATCH, DELETE | `requireAccountAdmin` (`:47`, `:164`) | `assertCanAdministerTarget` (`:58`, `:170`). Nobody resets their own password here (`:61`). Also: `assertCanGrantRole` (`:71`), no switching yourself off (`:73-75`), the CEO role is fixed (`:77-82`), PERSON is never granted (`:83-85`), the last project authority cannot be removed (`:87-95`), at most one admin, and the only admin cannot disable or demote itself (`:97-114`). `assertCanPlaceInDepartment` runs on a move (`:121`). `syncDepartmentHead` runs after a role, department or disable change (`:148-150`). DELETE: nobody deletes themselves (`:171-173`); 409 while the person owns projects (`:180-189`). |
| `/api/users/[id]/password` | POST | `requireAccountAdmin` (`:23`) | `assertCanAdministerTarget` (`:29`). Only the CEO sets the CEO's password (`:30-32`). Ends sessions and old invites (`:35-38`). |
| `/api/users/[id]/resend` | POST | `requireUser` (`:25`) | `assertCanAdministerTarget` (`:33`) holds the account-admin check (`lib/permissions.ts:154-156`). PENDING only (`:35-37`). At most 3 emails a minute (`:39-46`). `{email:false}` returns the link without sending it (`:26-27`). |
| `/api/users/[id]/tasks` | GET | `requireUser` (`:13`) | `loadScope` (`:14`). |
| `/api/users/me` | GET, PATCH | `requireUser` (`:16`, `:32`) | Your own name, opt-ins and phone. A PERSON cannot rename (`:38`). |
| `/api/users/me/password` | POST | `requireUser` (`:22`) | Proves the current password (`:29-40`). Ends other sessions and sets a fresh cookie (`:42-49`). |
| `/api/users/me/email` | POST | `requireUser` (`:25`) | Proves the current password, else 403 (`:29-31`). Checks the address looks like an email (`:34`). 409 if someone else has it (`:36-38`). Sets it as the main address and drops any matching extra address (`:41-42`). Sessions stay open. |

#### Organisation: set-up, departments, teams, categories, rules

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/org/setup` | GET | `requireUser` (`:13`) | FOUNDER only, else 403 (`:14`). Returns counts (`:15-23`). |
| `/api/departments` | GET, POST | `requireUser` (`:26`, `:57`) | GET: `visibleProjectIds` (`:27`), then the department filter (`:45-51`). POST: FOUNDER only (`:57-60`). A head must be an HOD who is not disabled (`:66-71`). |
| `/api/departments/[id]` | PATCH, DELETE | `requireUser` (`:24`, `:89`) | PATCH: FOUNDER changes any field; the department's own head changes only the description (`:38-42`, `:66-73`). A head must be an HOD who is not disabled; there is no status check, so an invited head is allowed (`:51-65`). DELETE: FOUNDER only (`:88-92`). 409 while it holds projects (`:99-105`), people or teams (`:106-115`). |
| `/api/departments/[id]/tasks` | GET | `requireUser` (`:13`) | `loadScope` (`:14`). |
| `/api/assignment-groups` | GET, POST | `requireUser` (`:14`, `:23`) | GET: `loadScope` (`:15`). POST: `assertCanShapeDepartment` (`:28`), then `workAccounts` (`:33`). |
| `/api/assignment-groups/[id]` | GET, PATCH, DELETE | `requireUser` (`:14`, `:22`, `:40`) | `loadScope` (`:15`). `assertCanShapeDepartment` (`:26`, `:44`). A new lead goes through `workAccounts` (`:30`). |
| `/api/assignment-groups/[id]/members` | POST, DELETE | `requireUser` (`:15`, `:29`) | `assertCanShapeGroup` (`:17`, `:31`). `workAccounts` (`:20`). |
| `/api/assignment-groups/[id]/tasks` | GET | `requireUser` (`:13`) | `loadScope` (`:14`). |
| `/api/task-categories` | GET, POST | `requireUser` (`:13`, `:21`) | POST: a department category needs `assertCanShapeDepartment`; a company-wide one is CEO only (`:26-27`). |
| `/api/task-categories/[id]` | PATCH, DELETE | `requireUser` (`:23`, `:32`) | The same rule (`:15-19`). |
| `/api/assignment-rules` | GET, POST | `requireUser` (`:12`, `:19`) | GET: FOUNDER or HOD (`:13`). POST: FOUNDER (`:20`). |
| `/api/assignment-rules/[id]` | PATCH, DELETE | `requireUser` (`:13`, `:22`) | FOUNDER (`:14`, `:23`). |

#### Work (tasks), Today, notes

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/work` | GET | `requireUser` (`:21`) | `loadScope` (`:22`). |
| `/api/work/[number]` | GET | `requireUser` (`:14`) | `loadWork`, 404 if not visible (`:19`). |
| `/api/tasks` | GET, POST | `requireUser` (`:27`, `:73`) | GET: `visibleProjectIds` (`:39`). POST: a private task goes to your own My notes (`:78-80`). Otherwise `createWork` (`:85`). |
| `/api/tasks/[id]` | GET, PATCH, DELETE | `requireUser` (`:18`, `:30`, `:51`) | `loadWork` (`:19`), `updateWork` (`:45`), `deleteWork` (`:52`). |
| `/api/tasks/[id]/assign` | POST | `requireUser` (`:14`) | `updateWork` (`:17`). See Trace 1. |
| `/api/tasks/[id]/transition` | POST | `requireUser` (`:14`) | `transitionWork` (`:18`). |
| `/api/tasks/[id]/start`, `/wait`, `/escalate`, `/resolve`, `/close`, `/cancel`, `/reopen` | POST (each) | `requireUser` (`:14`) | `transitionWork` (`:19`). Who may make each move is decided in `lib/work/access.ts:167-177`. |
| `/api/tasks/[id]/activity` | GET | `requireUser` (`:19`) | `requireSee` (`:20`). Team notes are shown only to staff on the task (`:22`). |
| `/api/tasks/[id]/history` | GET | `requireUser` (`:13`) | `requireSee` (`:14`). |
| `/api/tasks/[id]/comments` | POST | `requireUser` (`:17`) | `requireSee` (`:20`). |
| `/api/tasks/[id]/work-notes` | POST | `requireUser` (`:18`) | `requireSee`, and `isStaffOnTask` else 403 (`:21-22`). |
| `/api/tasks/[id]/attachments` | POST | `requireUser` (`:17`) | `requireSee` (`:22`). |
| `/api/tasks/[id]/attachments/[activityId]` | PATCH | `requireUser` (`:32`) | `requireSee` and `isStaffOnTask` (`:33-36`). |
| `/api/tasks/[id]/meetings` | GET | `requireUser` (`:18`) | `requireSee` (`:19`). |
| `/api/tasks/[id]/notifications` | GET | `requireUser` (`:13`) | `requireSee` (`:14`). |
| `/api/tasks/[id]/people` | GET, POST, DELETE | `requireUser` (`:20`, `:47`, `:115`) | `requireSee` (`:21`, `:48`). `canAssignTask` else 403 (`:49-51`, `:117`). |
| `/api/today` | GET | `requireUser` (`:21`) | `visibleProjectIds` (`:22`). Also lists your open tasks with no project (`:32-33`). |
| `/api/dashboard/today` | GET | `requireUser` (`:17`) | `loadScope` (`:18`). |
| `/api/dashboard/departments` | GET | `requireUser` (`:11`) | `loadScope` (`:12`). |
| `/api/comments` | GET, POST | `requireUser` (`:40`, `:61`) | On a task: `requireSee`, plus a staff check to read team notes (`:46-47`, `:68`). On a project or milestone: `assertCanSeeTarget` (`:51`, `:75`). |
| `/api/comments/[id]` | DELETE | `requireUser` (`:17`) | The author or the FOUNDER (`:20`, `:27`). |

#### Projects and milestones

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/projects` | GET, POST | `requireUser` (`:41`, `:62`) | GET: `visibleProjectIds` (`:42`). POST: `assertManager`, which lets FOUNDER, CO_FOUNDER, HOD and MANAGER through (`:63`). An HOD starts projects only in a department they head (`:73-75`). The lead must be ACTIVE (`:77-81`). The owner is always the caller (`:117`). Each invite row's position is checked before the project is made (`:93-97`). The rows go through `invitePeopleToProject` (`:138`). |
| `/api/projects/[id]` | GET, PATCH, DELETE | `requireUser` (`:19`, `:38`, `:104`) | `canSeeProject` (`:24`, `:41`, `:106`). Only the FOUNDER sets progress by hand (`:49-51`). Other changes need `canActAsProjectOwner` (`:53-55`, `:109`). The lead must be ACTIVE (`:57-62`). An HOD moves a project only into their own department (`:72-74`). |
| `/api/projects/[id]/members` | GET, POST, DELETE | `requireUser` (`:50`, `:59`, `:129`) | `canSeeProject` (`:51`, `:60`, `:130`). POST and DELETE need `canManageProject` (`:61`, `:131`). The `invites` list accepts any position (`:40`, `:69`). The single `invite` body still makes only TEAM_LEAD or RESOURCE (`:29`, `:76`, `:96`). |
| `/api/projects/[id]/plan` | POST | `requireUser` (`:31`) | `canSeeProject` (`:32`), `canManageProject` (`:33`). |
| `/api/projects/[id]/attendees` | GET | `requireUser` (`:13`) | `canSeeProject` (`:14-16`). |
| `/api/milestones` | GET, POST | `requireUser` (`:17`, `:31`) | `canSeeProject` (`:20`, `:36`). POST: `canManageProject` (`:37`). |
| `/api/milestones/[id]` | PATCH, DELETE | `requireUser` (`:27`, `:57`) | `canSeeProject` (`:21`). `canManageProject` (`:29`, `:59`). |
| `/api/milestones/[id]/outcome` | POST | `requireUser` (`:26`) | FOUNDER only (`:27`). |

#### Meetings and calendar

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/calendar` | GET | `requireUser` (`:28`) | `visibleProjectIds` (`:29`). |
| `/api/events` | POST | `requireUser` (`:33`) | `assertManager` (`:34`). `canSeeProject` (`:44`). A task meeting needs `requireSee` (`:49`). |
| `/api/events/[id]` | PATCH, DELETE | `requireUser` (`:36`, `:101`) | `assertManager` (`:37`, `:102`). `canSeeProject` (`:44`, `:105`). |
| `/api/events/[id]/reply` | POST | `requireUser` (`:24`) | Attendees only, else 404 (`:28-32`). |
| `/api/events/[id]/reschedule` | GET, POST | `requireUser` (`:22`, `:38`) | The organiser or the FOUNDER (`:16-18`, `:25`, `:43`). |

#### Notifications, push, WhatsApp test, files

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/notifications` | GET | `requireUser` (`:41`) | Your own rows only (`:46`, `:53`). |
| `/api/notifications/read` | POST | `requireUser` (`:17`) | Your own rows only (`:23`, `:30-32`). |
| `/api/notifications/[id]/snooze` | PATCH | `requireUser` (`:25`) | Your own row only (`:30-36`; the refusal is at `:34-36`). |
| `/api/push/subscribe` | POST, DELETE | `requireUser` (`:26`, `:48`) | DELETE removes only the caller's own subscription (`:52-55`). |
| `/api/whatsapp/test` | GET, POST | `requireManager` (`:18`, `:49`) | The comments say "manager-only", but the gate lets only the CEO through. |
| `/api/uploads` | GET, POST | `requireUser` (`:13`, `:19`) | Size limit (`:24`), blocked kinds (`:26`), per-person and total limits (`:27-28`). |
| `/api/uploads/[name]` | GET | `requireUser` (`:23`) | `canOpenFile`, else 404 (`:31-33`). Sent with safe headers (`:34-43`). See Trace 2. |

#### My space (personal)

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/my-space/departments` | GET, POST | `requireUser` (`:17`, `:29`) | Rows scoped to `ownerId` (`:19`, `:36`, `:43`). |
| `/api/my-space/departments/[id]` | PATCH, DELETE | `requireUser` (`:17`, `:33`) | Ownership helper (`:12`). |
| `/api/my-space/projects` | GET, POST | `requireUser` (`:16`, `:26`) | Rows scoped to `ownerId` (`:18`, `:32`). |
| `/api/my-space/projects/[id]` | PATCH, DELETE | `requireUser` (`:16`, `:32`) | — |
| `/api/my-space/prompt` | POST | `requireUser` (`:17`) | RESOURCE only (`:18-20`). |

#### Well Being (routine)

Every non-`kid` route calls `requireManager` (CEO only). Most then call `requireRoutineAccess`: an owner or an accepted collaborator may read, READ_ONLY cannot write, and some actions are owner-only (`lib/routine.ts:244-255`). The exceptions: `/api/routine` uses `getAccessibleRoutines` for GET and `getOwnedPersons` for POST (`app/api/routine/route.ts:26`, `:68`); `collaborators/[id]` uses `getOwnedPersons` (`app/api/routine/collaborators/[id]/route.ts:15`); `invites` and `invites/[id]` only filter on `managerId` = the caller and status PENDING (`app/api/routine/invites/route.ts:14`; `app/api/routine/invites/[id]/route.ts:12`).

| Path | Methods | Gate | Also checks |
|---|---|---|---|
| `/api/routine` | GET, POST | `requireManager` (`:22`, `:65`) | POST: `getOwnedPersons` (`:68`). |
| `/api/routine/person` | PATCH, DELETE | `requireManager` (`:14`, `:43`) | Owner only (`:15`, `:44`). |
| `/api/routine/segments` | POST | `requireManager` (`:12`) | Write access (`:13`). |
| `/api/routine/segments/[id]` | PATCH, DELETE | `requireManager` (`:14`, `:26`) | Write access and `requireOwnSegment` (`:15-16`, `:27-28`). |
| `/api/routine/habits` | POST | `requireManager` (`:12`) | Write access and `requireOwnSegment` (`:13`, `:18`). |
| `/api/routine/habits/[id]` | PATCH, DELETE | `requireManager` (`:14`, `:34`) | Write access and `requireOwnHabit` (`:15-16`, `:35-36`). |
| `/api/routine/habit-mark` | PATCH | `requireManager` (`:13`) | Write access and `requireOwnHabit` (`:14`, `:19`). |
| `/api/routine/non-negotiables` | POST | `requireManager` (`:12`) | Write access (`:13`). |
| `/api/routine/non-negotiables/[id]` | PATCH, DELETE | `requireManager` (`:14`, `:30`) | Write access and `requireOwnNonNegotiable` (`:15-16`, `:31-32`). |
| `/api/routine/non-negotiable-mark` | PATCH | `requireManager` (`:15`) | Write access and `requireOwnNonNegotiable` (`:16`, `:21`). |
| `/api/routine/tasks` | POST | `requireManager` (`:12`) | Write access (`:13`). |
| `/api/routine/tasks/[id]` | DELETE | `requireManager` (`:13`) | Write access (`:14`). |
| `/api/routine/weight` | POST | `requireManager` (`:12`) | Write access (`:13`). |
| `/api/routine/weight/[id]` | PATCH, DELETE | `requireManager` (`:14`, `:31`) | Write access and `requireOwnWeight` (`:15-16`, `:32-33`). |
| `/api/routine/reminder` | POST | `requireManager` (`:15`) | Write access (`:16`). |
| `/api/routine/collaborators` | POST | `requireManager` (`:17`) | Owner only (`:18`). The invitee must be an active MANAGER (`:28`). |
| `/api/routine/collaborators/[id]` | PATCH, DELETE | `requireManager` (`:22`, `:34`) | Only for persons you own (`:15`). |
| `/api/routine/invites` | GET | `requireManager` (`:12`) | — |
| `/api/routine/invites/[id]` | POST, DELETE | `requireManager` (`:17`, `:26`) | — |
| `/api/routine/kid` | GET | `requirePerson` (`:22`) | Your own Person only (`:23-24`). |
| `/api/routine/kid/tasks/[id]` | PATCH | `requirePerson` (`:15`) | — |
| `/api/routine/kid/habit-mark` | POST | `requirePerson` (`:21`) | `requireOwnHabit` (`:31`). |
| `/api/routine/kid/non-negotiable-mark` | POST | `requirePerson` (`:20`) | `requireOwnNonNegotiable` (`:29`). |

### 5. `lib/` modules by concern

#### Session and sign-in
| Module | What it does | Lines |
|---|---|---|
| `lib/auth.ts` | The `orbit_session` cookie and its flags, the HS256 session token signed with `AUTH_SECRET` (role, name, session version), and the `APP_PASSCODE` comparison used by bootstrap. Details in Trust boundaries §1. | `:3-4`, `:15`, `:26-32`, `:35-42`, `:53-72`, `:75-85`, `:91-102` |
| `lib/session.ts` | The gates and the `route()` wrapper (§3). | `:24-124` |
| `lib/password.ts` | scrypt hashes and temporary passwords. | `:26-27`, `:33`, `:71` |
| `lib/login-attempts.ts` | Counts failures per IP in the database. The IP is hashed with `AUTH_SECRET`. | `:18-22`, `:24-29`, `:36` |
| `lib/user-emails.ts` | One person, several addresses. `User.email` is the main one; `UserEmail` rows are extras. Both are searched together. | `:3-10`, `:49`, `:58`, `:67`, `:86` |
| `lib/account-guards.ts` | At most one admin, and at least one active project authority. | `:3-11`, `:13`, `:27`, `:35` |
| `lib/invite.ts` | Invite tokens (Data and invariants → Invite tokens). `issueInvite` makes or replaces the link, and emails it unless `send:false`. | `:8-13`, `:16`, `:43-85` |
| `lib/base-url.ts` | The absolute link base, in this order: `APP_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`, then a fixed fallback. Development uses localhost. | `:23-36` |
| `lib/api.ts` | The browser's fetch helper. A 401 sends the page to `/login`. | `:19-23` |

#### Roles, permissions and visibility
| Module | What it does | Lines |
|---|---|---|
| `lib/roles.ts` | Pure role checks used by both client and server. `isExecutiveRole` is FOUNDER only (`:21-22`). `oversesCompanyRole` adds CO_FOUNDER (`:30-31`). `isManagerRole` covers FOUNDER, CO_FOUNDER, HOD and MANAGER (`:47-48`). `ROLE_RANK` is at `:77-86`. | as listed |
| `lib/permissions.ts` | `assertManager` (`:51-53`), `assertCanAssign` (`:68-91`), `assertCanListUsers` (`:94-96`), `assertCanCreateUserWithRole` (`:104-131`), `assertCanGrantRole` (`:138-140`), `assertCanAdministerTarget` (`:150-186`), `assertCanPlaceInDepartment` (`:194-206`). | as listed |
| `lib/project-visibility.ts` | `visibleProjectIds`: the FOUNDER sees all; everyone else sees their department, any department they head, and projects they own, lead, belong to or hold a task in (`:20-52`). Also `canSeeProject` (`:55-58`), `canAccessTask` (`:64-71`), `canActAsProjectOwner` (`:84-94`). | as listed |
| `lib/project-people.ts` | `projectPeople` lists who is on a project, active and invited (`:12`, `:40`, `:53`). `canManageProject` counts the lead (`:98-108`, `:105`). | as listed |
| `lib/comments.ts` | `assertCanSeeTarget`: one check for every note thread. | `:11` |
| `lib/file-access.ts` | `canOpenFile`: the uploader, or anyone who can see a note, logo or task result that holds the file (Trace 2). | `:25-58` |

#### `lib/work/*` (the task model)
| Module | What it does | Lines |
|---|---|---|
| `lib/work/access.ts` | `loadScope` (`:53-76`), `canSeeTask` (`:104-111`), `isStaffOnTask` (`:119-126`), `canEditTask` (`:134-144`), `canAssignTask` (`:147-156`), `canDeleteTask` (`:159-165`), `canTransitionTask` (`:177`). | as listed |
| `lib/work/tasks.ts` | Creating, updating, moving and deleting work tasks goes through here, in one transaction, recorded in the activity stream before events go out (`:1-7`). Some writes skip it and record no activity: the private-task create (`app/api/tasks/route.ts:150-172`), My space Prompt (`app/api/my-space/prompt/route.ts:39-53`), personal-project delete (`app/api/my-space/projects/[id]/route.ts:40`), Add people's first key and remove-person (`app/api/tasks/[id]/people/route.ts:70`, `:137`, `:141`), milestone delete (`app/api/milestones/[id]/route.ts:68`), plan (`app/api/projects/[id]/plan/route.ts:75`) and the review-date sync (`lib/meetings.ts:63`). `loadWork` (`lib/work/tasks.ts:60-68`), `requireSee` (`:71-76`), `createWork` (`:235`), `updateWork` (`:405`), `transitionWork` (`:582`), `deleteWork` (`:660`). | as listed |
| `lib/work/workflow.ts` | The state machine and its status projection. `TRANSITIONS` (`:14`), `statusOf` (`:33`), `pathToStatus` (`:68`). | as listed |
| `lib/work/assignment.ts` | `routeWork` (`:38`). `assertAssigneeAllowed` (`:93-132`); an invited person may already hold work (`:106-110`). | as listed |
| `lib/work/activity.ts` | The activity stream. `recordChanges` (`:134`), `addNote` (`:187`). | as listed |
| `lib/work/events.ts` | Decides who hears about a change and on which tier: bell only, push, or full message (`:1-11`). `emit` is at `:82`. | as listed |
| `lib/work/query.ts` | Queues and counters. `visibilityWhere` (`:18`), `listWork` (`:211`), `departmentBreakdown` (`:340`), `parseFilter` (`:381`). | as listed |
| `lib/work/org.ts` | Who may shape teams: `assertCanShapeDepartment` (`:40-44`), `assertCanShapeGroup` (`:47-52`). `workAccounts` has no status filter, so invited people can join teams (`:74-78`). Team lists include invited members (`:33-34`). | as listed |

#### Notify, email, WhatsApp, push
| Module | What it does | Lines |
|---|---|---|
| `lib/notify.ts` | Three ways out: `bellUsers` (`:42`), `notifyUsers` (bell and push, `:71`), and `sendMessage` (bell, push, email and WhatsApp, `:83-141`). A PENDING person gets the bell row only (`:91-95`). Push does not wait (`:110`). Email is awaited (`:112-131`). WhatsApp sends only when configured (`:133-139`). | as listed |
| `lib/messages.ts` | Builds the five messages (task_given, task_note, task_resolved, tomorrow, review_result) once for every channel. The header comment at `:5-12` still says three. | `:14`, `:38`, `:69`, `:89`, `:116`, `:160` |
| `lib/email-templates.ts` | Email bodies: `inviteEmail` (`:85`), `tomorrowEmail` (`:188`). | as listed |
| `lib/email.ts` | SMTP through nodemailer (§9). | `:18-123` |
| `lib/whatsapp.ts` | Twilio REST calls (§9). | `:31-226` |
| `lib/push.ts` | Web push signed with VAPID keys (§9). | `:27-81` |

#### Uploads and file access
| Module | What it does | Lines |
|---|---|---|
| `lib/uploads.ts` | Stores files in Blob or the database, with limits, safe serving and the sweep (§10). | `:5-222` |
| `lib/file-access.ts` | See Roles, permissions and visibility above. | `:25-58` |
| `lib/note-files.ts` | A note carries at most 10 files. | `:10` |
| `lib/file-kinds.ts` | Works out a file's kind for display. Screens only. | `:1-3` |

#### Meetings and "tomorrow"
| Module | What it does | Lines |
|---|---|---|
| `lib/meetings.ts` | Reviews sit at 11:00 IST (`:9`). `meetingAttendeeCandidates` (`:19`), `syncReviewMeeting` (`:76`), `syncProjectReviews` (`:129`). | as listed |
| `lib/task-meetings.ts` | A task's meeting invites only the people on that task (`:11`, `:24`). | as listed |
| `lib/meeting-reply.ts` | Signed "I'll be there" / "Can't" links, valid 7 days. | `:13`, `:23`, `:33`, `:46` |
| `lib/tomorrow.ts` | `buildTomorrow` (`:20`), `sendTomorrow` (`:110-118`), `resendForMeeting` (`:124`). | as listed |
| `lib/timezone.ts` | IST day keys and ranges. | `:6`, `:15`, `:21`, `:29` |
| `lib/calendar.ts` | Pure calendar helpers for the screens. | `:1-7` |

#### Routine (Well Being)
| Module | What it does | Lines |
|---|---|---|
| `lib/routine.ts` | `getOwnedPersons` (`:204-217`), `getAccessibleRoutines` (`:222-238`), `requireRoutineAccess` (`:244-255`), `DEFAULT_SEGMENTS` (`:97`), `remindPerson` (`:300`), `buildHabitGrid` (`:343`). | as listed |

#### Organisation set-up
| Module | What it does | Lines |
|---|---|---|
| `lib/default-departments.ts` | The nine departments a new organisation starts with. Structure only; nobody is placed in them. | `:1-17` |
| `lib/department-heads.ts` | `syncDepartmentHead` (rules under Data and invariants → A department's head). | `:21-48` |
| `lib/invite-people.ts` | `invitePeople`. Checks addresses, clashes, the position and the placement for every row (`:22-51`), then makes each account, runs `syncDepartmentHead`, and issues a link (`:53-63`). | as listed |
| `lib/project-invites.ts` | `invitePeopleToProject`. Someone already on Orbit is added; anyone else is invited into the project's department and may become its head (`:11-16`, `:32`, `:99`). | as listed |

#### Other
`lib/prisma.ts` holds the database client (§7). `lib/serialize.ts` shapes rows into what the screens receive. `lib/validation.ts` holds the zod input checks. `lib/types.ts` holds the shared value lists (`:4-8`). `lib/projects.ts` adds progress and "behind" to projects (`:6-15`). `lib/plan.ts` is the milestone planner (`:3-8`). `lib/milestones.ts` is server code: `milestoneRows` (`lib/milestones.ts:5`) reads a project's milestone boxes with task counts and the latest note through Prisma, for `app/api/milestones/route.ts:7`, `app/api/milestones/[id]/route.ts:6`, `app/api/milestones/[id]/outcome/route.ts:5` and `app/api/projects/[id]/plan/route.ts:8`. `lib/hooks/*` holds 20 hooks: 13 are React Query data hooks; `use-collapse`, `use-edit-mode`, `use-first-mount`, `use-install`, `use-panel`, `use-push` and `use-time-scene` are not. `lib/task-cache.ts` keeps the task lists in a React Query cache in step (`lib/task-cache.ts:17`, `:46-50`). The rest are pure screen helpers: `lib/dates.ts`, `lib/status.ts`, `lib/order.ts`, `lib/tree.ts`, `lib/steps.ts`, `lib/weeks.ts`, `lib/projection.ts`, `lib/theme.ts`, `lib/cn.ts`, `lib/project-look.ts`, `lib/pwa/install-store.ts`.

### 6. Where each Phase 2 change lives (9c3eafd)

| Change | Server | Screen |
|---|---|---|
| First run makes the CEO and the default departments | `app/api/auth/bootstrap/route.ts:74-95`. The role is FOUNDER (`:79`). Departments are made only when there are none (`:83-91`). | `app/login/page.tsx:9-10`, `components/login-form.tsx:34`, `:73` |
| Invite several people at once | `app/api/users/invite/route.ts:10-33` calls `lib/invite-people.ts:21-65`. | `components/people/invite-sheet.tsx:35`, `:61-62`, `:116-125` |
| Shared new-person rows (Position, Department) | — | `components/people/new-people-rows.tsx:54-182`. Position shows when more than one position is offered (`:144-159`). Department shows only when the screen passes a list (`:161-172`). |
| Where the rows are used | People → Invite posts to `/api/users/invite` (`lib/hooks/use-users.ts:108-112`). Add people posts `invites` to `/api/projects/[id]/members` (`lib/hooks/use-projects.ts:153-162`). New project posts to `/api/projects` (`lib/hooks/use-projects.ts:80`). New Task posts to `/api/users/invite` with the task's department (`components/work/new-work-sheet.tsx:117-119`). | `components/people/invite-sheet.tsx:116` (passes departments, `:120`), `components/sheets/add-people-sheet.tsx:202`, `components/sheets/new-project-sheet.tsx:295`, `components/work/new-work-sheet.tsx:321` |
| A Head of department heads the department they are placed in | `lib/department-heads.ts:37-47`. Called from `app/api/users/route.ts:133`, `app/api/users/[id]/route.ts:149`, `lib/invite-people.ts:60`, `lib/project-invites.ts:99`. | — |
| A head or a manager places people only in a department they run | `lib/permissions.ts:194-206`. Used at `app/api/users/route.ts:118`, `app/api/users/[id]/route.ts:121`, `lib/invite-people.ts:44`. | The same rule is applied on screen at `components/people/invite-sheet.tsx:38-43`, `:56`. |
| Account → Sign-in email | `app/api/users/me/email/route.ts:24-44` | `components/settings/account-page.tsx:138-187`, `lib/hooks/use-users.ts:115-121` |
| CEO set-up card | `app/api/org/setup/route.ts:12-24` | `components/today/setup-card.tsx:20-51`. "Hidden" is remembered only in this browser (`:12`, `:53-60`). Shown at `components/today/today-page.tsx:33`. |
| Today lists tasks with no project; + opens New Task | `app/api/today/route.ts:32-33` | `components/today/today-page.tsx:58-59`. `give-task-sheet.tsx` is gone from `components/sheets`. |
| `canManageProject` counts the project's lead | `lib/project-people.ts:105` | `components/project/can-manage.ts:22` |
| Invited (PENDING) people can be picked | Tasks: `lib/work/assignment.ts:106-110`, `lib/project-people.ts:40`. Teams: `lib/work/org.ts:33-34`, `:74-78`. Heads: `app/api/departments/[id]/route.ts:51-65`. | `components/work/work-sheets.tsx:54-55`, `:228`, `components/work/work-page.tsx:131`, `components/sheets/department-sheet.tsx:52-53`, `:154` |
| A department with people or teams is not deleted | `app/api/departments/[id]/route.ts:106-115` | — |
| Nobody resets their own password from People | `app/api/users/[id]/route.ts:61` | `components/people/person-sheet.tsx:442-443` |
| A dead invite link says which kind it is | `app/api/invite/[token]/accept/route.ts:40-51` | `components/set-password-form.tsx:61-64` |
| Work tabs scroll in their own row | — | `components/work/sn.tsx:38-43` |

9c3eafd changes no Prisma file (`git show --stat 9c3eafd`).

### 7. Prisma

- **Client.** One `PrismaClient` per process; outside production it is kept on `globalThis` so hot reload does not open new connections (`lib/prisma.ts:7-13`). `npm install` generates the client (`package.json:7`).
- **Schema.** `prisma/schema.prisma`, on Postgres at Neon. `DATABASE_URL` is the pooled (pgbouncer) connection the running app uses (`:7-8`); `DATABASE_URL_UNPOOLED` is the direct connection migrations use (`:9-11`).
- **Models.** 35, in `prisma/schema.prisma:155-1013` (line numbers in that file): User 155, Department 239, ProjectMember 268, Project 283, Milestone 343, PasswordResetRequest 370, Comment 388, Task 406, PersonalDepartment 529, PersonalProject 541, LoginAttempt 557, PushSubscription 568, CalendarEvent 587, EventAttendee 624, UserEmail 646, StoredFile 659, CommentAttachment 676, Invite 694, EmailLog 712, WhatsAppLog 728, Notification 742, the Well Being models 780-918 (Person, RoutineCollaborator, HabitSegment, Habit, HabitMark, NonNegotiable, NonNegotiableMark, WeightEntry, RoutineTask), AssignmentGroup 919, AssignmentGroupMember 938, TaskCategory 953, AssignmentRule 974, TaskActivity 988. Not described elsewhere: LoginAttempt is one row per failed sign-in, by IP hash (`:555-563`); PushSubscription is one row per browser endpoint (`:565-579`); PasswordResetRequest is one pending forgot-password request per person for the admin (`:367-383`); EmailLog and WhatsAppLog are send ledgers with a unique `dedupeKey` (`:708-738`); Notification is a bell line (`:740-770`); TaskCategory is what a task is about, with subcategories and an optional team to route to (`:950-970`); AssignmentRule is a routing rule with JSON `match` and `set`, applied in `order` when a task is created (`:972-983`).
- **Migrations folder.** `prisma/migrations` holds 40 migrations, from `20260721061215_init` to `20260911090000_task_progress_meetings`, plus `migration_lock.toml`.
- **How migrations reach production.** The build script is `prisma migrate deploy && next build` (`package.json:8`). `vercel.json` sets no build command, so Vercel runs this script on every build, and the script does not check the branch. A build of origin main migrates the database, and so does a preview build of any branch whose environment points at the same database. Which variables preview builds receive is set in Vercel, not in this repository. In practice, a migration pushed on any branch reaches production at that branch's first preview build.
- **Locally.** `npm run db:deploy` and `npm run db:migrate` (`package.json:21`, `:33`) run `scripts/db-deploy.sh`, which refuses to run without `.env.local` (`:12-15`) or when its URLs are not localhost (`:25-32`). A bare `npx prisma migrate deploy` reads `.env` and so migrates production (`scripts/db-deploy.sh:4-7`).
- **Seed.** `prisma/seed.ts` is for local development only and does nothing when a project already exists.

### 8. Crons (`vercel.json`)

Vercel Cron schedules are in UTC. Vercel sends `CRON_SECRET` as a Bearer token; both routes refuse any other caller with 401.

| Path | Schedule | IST | What it does |
|---|---|---|---|
| `/api/cron/tomorrow` | `30 12 * * *` (`vercel.json:4-5`) | 18:00 | `sendTomorrow` (`app/api/cron/tomorrow/route.ts:25`). Each person with something tomorrow gets one message: tasks due tomorrow, how many are late, and tomorrow's meetings with reply links. Nothing to say means no message (`lib/tomorrow.ts:8-12`, `:110-118`). It goes out through `sendMessage`, and a re-run adds nothing (`lib/notify.ts:98-108`). |
| `/api/cron/snooze-wake` | `0 3 * * *` (`vercel.json:8-9`) | 08:30 | Finds notifications whose snooze time has passed, clears the snooze and marks them unread, claiming each row first so nothing is pushed twice, then pushes again (`app/api/cron/snooze-wake/route.ts:41-66`). It then deletes stored files nobody has used for a day (`:68-73`, `lib/uploads.ts:155-163`). The comment at `:17` says "short interval"; the schedule is daily. The bell does not wait for it: `GET /api/notifications` already treats a past snooze time as active (`app/api/notifications/route.ts:43-48`), so this run only makes the line unread again and pushes it, up to a day after its time (`app/api/cron/snooze-wake/route.ts:53-65`). |

### 9. Outside services and how environment variables turn each on

Every channel fails quietly: missing settings or a provider error never fail the action that triggered the send (`lib/notify.ts:18`, `lib/email.ts:4-7`, `lib/whatsapp.ts:3-8`, `lib/push.ts:8-13`).

| Service | Module | Turned on by | When unset | Other rules |
|---|---|---|---|---|
| Email (SMTP) | `lib/email.ts` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (`:20-25`). Optional: `SMTP_SECURE` (`:29`), `EMAIL_REPLY_TO` (`:111`). | Every send returns "not-configured" (`:74`). | Never mails `.local`, `.test`, `.example` and similar domains (`:57-62`). In development, only `EMAIL_DEV_ALLOW` addresses, or everyone with `"*"` (`:88-95`). An `EmailLog` row is reserved before sending and released if the send fails (`:97-122`). Invite links still come back to the person inviting, so they can be sent by hand (`lib/invite.ts:63-64`, `lib/invite-people.ts:61-62`). `records/plans/new-organisation.md:59` says the live site has no SMTP settings. |
| WhatsApp (Twilio) | `lib/whatsapp.ts` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (`:35-44`). Optional: `TWILIO_CONTENT_SID` for an approved template (`:54`, `:105-110`), `TWILIO_API_BASE` for tests (`:121`). | Every send does nothing and logs once (`:38-43`). | Only to people who are not disabled, have a phone number and have WhatsApp alerts on (`:213-217`, filter at `:215`); status is not checked there. The ACTIVE limit comes from `sendMessage` (`lib/notify.ts:95`, `:133-135`). Deduplicated with `WhatsAppLog` (`lib/whatsapp.ts:165-177`). The sandbox "not joined" errors are recognised (`:146-149`). |
| Web push | `lib/push.ts` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`:29-36`). The browser uses `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (`lib/hooks/use-push.ts:15`). | No push is sent (`:52`). | Subscriptions are saved through `/api/push/subscribe`. A subscription the push service reports gone (404/410) is deleted (`:69-71`). |
| Vercel Blob | `lib/uploads.ts` | `BLOB_READ_WRITE_TOKEN` (`:81-82`) | Files go into Postgres (§10). | — |
| Vercel Cron | cron routes | `CRON_SECRET` | Both cron routes answer 401. | — |

Other variables: `AUTH_SECRET` signs sessions (`lib/auth.ts:26-32`) and keys the IP hash (`lib/login-attempts.ts:18-22`). `APP_PASSCODE` is used only by bootstrap (`lib/auth.ts:91-93`). `APP_URL` and the `VERCEL_*` URLs set the link base (`lib/base-url.ts:26-35`). `UPLOAD_DATABASE_CAP_MB` sets the total size of files kept in the database (`lib/uploads.ts:48`).

### 10. Where files live

- **No Blob token.** `POST /api/uploads` (`app/api/uploads/route.ts:18-32`) puts the bytes in the Postgres table `StoredFile` (`prisma/schema.prisma:659-670`) through `storeUpload` (`lib/uploads.ts:98-103`); the uploader is always the caller (`app/api/uploads/route.ts:30`). The address is `/api/uploads/<id>`, served by `app/api/uploads/[name]/route.ts` only to a signed-in person who passes `canOpenFile`; anyone else gets 404 (`:23-33`). The stored type is what the browser sent, or a guess from the name (`app/api/uploads/route.ts:25`). Pictures, PDFs, audio, video and plain text open in the browser; SVG and every other kind download, with a sandboxing header (`lib/uploads.ts:113-127`, route `:34-43`; table in Trace 2).
- **Limits.** One file may be 4 MB on Vercel or without Blob, 25 MB with Blob and not on Vercel (`lib/uploads.ts:14-19`, `:38-41`). The database store also limits each person to 40 files or 80 MB an hour, and everyone together to 300 MB by default (`:46-60`). File kinds that could run on a colleague's machine are refused by extension or type (`:25-35`).
- **Clean-up.** Deleting a note removes its files at once, unless something else still uses them (`releaseFiles`, `:166-173`). The daily snooze-wake cron removes files that have gone unused for a day (`:155-163`). Both handle only `/api/uploads/` addresses (Data and invariants → Files).
- **With a Blob token.** The file is uploaded to `blob.vercel-storage.com` under `notes/` with a random suffix, and the Blob URL is stored (`:82-96`). Vercel Blob serves that URL, not Orbit, so `canOpenFile` does not guard it.
- **Local development only.** Files attached on a laptop before 2026-09-10 are still read from `.localdb/uploads` (`:175-186`).
- **Out-of-date note.** `records/plans/vercel-deploy.md:25` says the camera and paper-clip hide without Blob. The code always offers them (`app/api/uploads/route.ts:8-15`).

### 11. Surprises for an engineer or a tester

1. `requireManager` lets only the CEO through (`lib/session.ts:66-72`); every Well Being manager route and `/api/whatsapp/test` use it.
2. A Well Being collaborator must be a MANAGER (`app/api/routine/collaborators/route.ts:28`), but a MANAGER cannot pass `requireManager` and the middleware sends them away from `/routine` (`middleware.ts:61-66`). So a collaboration opens nothing.
3. `requireProjectAuthority` (`lib/session.ts:76-82`) has no callers.
4. `lib/work/access.ts:57` says "The CEO and the co-founder reach everything", but the next line uses `isExecutiveRole`, which is FOUNDER only (`lib/roles.ts:21-22`). A co-founder gets a department-scoped view.
5. `invitePeople` checks every row first, then creates accounts one at a time outside a transaction (`lib/invite-people.ts:42-63`). If a create fails partway, for example when two invites race for the same address, the people already made stay.
6. An invited person can hold tasks, join teams and be named a head, but cannot be a project lead yet: the lead must be ACTIVE (`app/api/projects/route.ts:77-81`, `app/api/projects/[id]/route.ts:57-62`).
7. The single `invite` body on `/api/projects/[id]/members` still makes only a Team lead or Team member (`:29`, `:76`, `:96`). No screen calls it; `invitePerson` in `lib/hooks/use-projects.ts:142` is exported but unused.
8. A disabled user's pages still load, because the middleware reads only the token; their API calls then get 401 and the browser goes to `/login` (`lib/api.ts:19-23`).
9. Every Vercel build runs the migrations first (`package.json:8`); see §7.

## Data and invariants

Each rule gives the line that makes it true. "Refused" means the server returns an error; a hidden button on screen is not a rule.

### How an organisation's data starts

- **First run** creates the CEO and the default departments in one serializable transaction (`app/api/auth/bootstrap/route.ts:75-95`). It counts users again inside the transaction (`:77`), creates one `FOUNDER` (`:79`), and creates the nine default departments (name, colour, description, nobody placed: `lib/default-departments.ts:7-17`) only when there are none (`app/api/auth/bootstrap/route.ts:83-91`). If two people run setup at the same moment, one wins and the other gets 410 (`:96-101`). Once any user exists, the route always returns 410 (`:50-56`).
- **Everyone else is invited.** `POST /api/users/invite` (`app/api/users/invite/route.ts:27-31`) calls `invitePeople` (`lib/invite-people.ts:21-65`):
  - **Checks run before any write.** Each row needs an email, well-formed, and not used twice in the batch (`:25-40`). The inviter must have the right to give that position and to place the person there (`:42-45`; who may do what is in Trust boundaries §5, `lib/permissions.ts:194-206`: only a head or manager is limited (`:198`), to their own or headed department (`:205`), and may not leave a person unplaced when they have or head a department (`:201-203`)). The departments must exist (`:46-49`). No address may already be on Orbit, as a main or an extra address; that clash returns 409 (`:50-51`).
  - **Defaults:** a row with no position becomes `RESOURCE`, shown as "Team member" (`:37`). A row with no department stays unplaced (`:38`).
  - **Writes:** each person is created as `PENDING` with no password (`:57`), then gets their other addresses (`:59`), then `syncDepartmentHead` (`:60`), then an invite link (`:61`). People are written one at a time; the batch is **not** one transaction (Architecture §11.5).

### The task lifecycle (`lib/work/workflow.ts`)

`TRANSITIONS` (`:14-26`) is the only list of allowed moves.

| From | May move to | Line |
|---|---|---|
| NEW | ASSIGNED, IN_PROGRESS, CANCELLED | `:15` |
| ASSIGNED | IN_PROGRESS, NEW, CANCELLED | `:16` |
| IN_PROGRESS | WAITING, RESOLVED, ESCALATED, ASSIGNED, NEW, CANCELLED | `:19` |
| WAITING | IN_PROGRESS, CANCELLED | `:20` |
| ESCALATED | IN_PROGRESS, RESOLVED, CANCELLED | `:21` |
| RESOLVED | CLOSED, REOPENED | `:22` |
| CLOSED | REOPENED | `:23` |
| CANCELLED | REOPENED | `:24` |
| REOPENED | IN_PROGRESS, CANCELLED | `:25` |

- **Button words** depend on the target state (`:102-112`): NEW "Return to Queue", ASSIGNED "Stop Work", IN_PROGRESS "Start Work", WAITING "On Hold", RESOLVED "Mark Complete", CLOSED "Close", CANCELLED "Cancel", ESCALATED "Escalate", REOPENED "Reopen".
- **Checks, in order:** (1) a move that is not in the table gets 409 (`lib/work/tasks.ts:597-599`); (2) `canTransitionTask` decides who may move it (`lib/work/access.ts:177-179`; rules in the comment at `:167-176`), and a step uses `canEditTask` instead (`lib/work/tasks.ts:601`); when (2) refuses RESOLVED on a `PROJECT_TASK` the 403 reads "Only a team lead or above marks a task done." (`:603`), and any other refusal "You can't make that change." (`:604`); (3) a WAITING move without a reason gets 400 (`:606-607`).
- **What a move must carry:** WAITING needs a reason (`workflow.ts:58`); without one the move gets 400 (`tasks.ts:607`). RESOLVED "needs" a resolution (`workflow.ts:59`), but the write fills in `COMPLETED` when none is given (`tasks.ts:167`), so a resolve without one is not refused.
- **What each move writes** (`transitionData`, `tasks.ts:147-199`):
  - IN_PROGRESS, ASSIGNED, NEW: clear `waitingReason` and `waitingNote`.
  - WAITING: sets the reason (OTHER if none is given) and the note.
  - ESCALATED: sets `escalatedAt`.
  - RESOLVED: sets `resolutionCode`, `resolutionNotes`, `rootCause`, `resolvedAt`/`By` and `completedAt`/`By`, and clears the waiting fields.
  - CLOSED: sets `closedAt`/`By`. CANCELLED: sets `closedAt`/`By` and `archived = true`, and clears `waitingReason` but not `waitingNote` (`tasks.ts:181-186`).
  - REOPENED: clears the resolved, closed and completed fields and `resolutionCode`, and sets `archived = false`.
- **Holder changes during a move:** Start Work on a task nobody holds makes the actor its holder and giver (`tasks.ts:611-615`). Return to Queue removes the holder (`:617-619`). Neither touches `assignedAt`; the integrity checks at the end show why that matters.
- **History:** every move writes one `FIELD_CHANGE` row per changed field, in the same transaction (`:620-629`).
- **Old four-word screens:** `pathToStatus` turns To do / Doing / Stuck / Done into a series of moves (`workflow.ts:68-87`), each checked and recorded on its own (`tasks.ts:646-655`). A "Stuck" move writes reason OTHER with the note "Stuck" (`:651`). At 9c3eafd a Stuck from Escalated asks for Escalated → WAITING (`workflow.ts:79`), which `TRANSITIONS` refuses (`workflow.ts:21`), so it gets 409 (`tasks.ts:597-599`). The uncommitted working tree sends it through IN_PROGRESS first (`lib/work/workflow.ts:78-82` there).

### Status is a projection of state (`statusOf`, `workflow.ts:33-47`)

| state | status |
|---|---|
| IN_PROGRESS, ESCALATED | DOING |
| WAITING | STUCK |
| RESOLVED, CLOSED, CANCELLED | DONE |
| NEW, ASSIGNED, REOPENED | TODO (the default branch) |

- **Open and finished:** open states are NEW, ASSIGNED, IN_PROGRESS, WAITING, ESCALATED and REOPENED; finished states are RESOLVED, CLOSED and CANCELLED (`workflow.ts:49-50`). Lists use the same six open states (`lib/types.ts:116`).
- **Who writes status:** the service always writes `status: statusOf(state)`: in moves (`tasks.ts:148`), on create (`:332-333`) and on assignment (`:505`). Two other writers skip it. The private-task create writes both columns itself with the same mapping, status DONE becoming state CLOSED (`app/api/tasks/route.ts:161-162`). My space Prompt writes status TODO and leaves `state` at its default NEW (`app/api/my-space/prompt/route.ts:49`; `prisma/schema.prisma:472`).
- **Steps done** is counted from `status` (`lib/serialize.ts:137`).

### A task given to someone is in progress at once

- **`stateAfterAssignment`** (`workflow.ts:95-99`): NEW or ASSIGNED that gains a holder becomes IN_PROGRESS; ASSIGNED or IN_PROGRESS that loses its holder becomes NEW; every other state stays put, so a WAITING or ESCALATED task that loses its holder stays WAITING or ESCALATED.
- **`updateWork`** applies it only to top-level tasks, not steps (`tasks.ts:503-506`). In the same save, `assignedAt` is set when the holder changes and cleared when nobody holds it (`:501`), and the actor becomes `givenBy` for a new holder (`:502`).
- **`createWork`:** a named holder means `IN_PROGRESS`, otherwise the task starts `NEW` (`:321`). `assignedAt` and `givenById` are set only when someone holds it (`:342`, `:346`). On a project, a create request with no assignee field gives the task to its creator (`:301`). A step never has a holder (`:252`, `:301`).
- **Who may hold a task:** an invited (PENDING) person may; a disabled account, PERSON or ADMIN may not (`lib/work/assignment.ts:106-108`). Meeting invitees must be ACTIVE (`lib/meetings.ts:36`), so a PENDING holder is left out of their task's meeting until they accept their invite.

### One task given to several people

- **Model:** one record per person. The records share `siblingKey`; null means not shared (`prisma/schema.prisma:478-482`, index `:518`).
- **Created:** the New Task sheet makes one key when it raises the task for more than one person, then creates one record per person (`components/work/new-work-sheet.tsx:144-148`). Add people (`POST /api/tasks/[id]/people`) gives the source record a key the first time (`app/api/tasks/[id]/people/route.ts:69-70`), skips people who already hold a record (`:81`) and disabled, PERSON and ADMIN accounts (`:82-83`), then calls `createWork` with the same key (`:84-98`), so each new record starts IN_PROGRESS.
- **Removed:** removing a person soft-deletes their records, never the record being viewed (`:126-128`, `:137`). When one live record is left, the key is cleared from all rows (`:139-141`).
- **"Also with":** filled once per page from live records that have a holder, one entry per person (`lib/work/query.ts:186-206`). The record page (`app/api/work/[number]/route.ts:24-36`; one entry per person, never this record's holder, `:32-35`) and `GET …/people` (`people/route.ts:19-37`) work the same way.
- **How lists collapse:**
  - `listWorkTasks` (`rows=tasks`) keeps the first record per key in the chosen order, counts tasks, not records, and uses numbered pages (`query.ts:228-264`; collapse `:234-242`, total `:263`).
  - `listWork` (default, cursor pages) returns records, not collapsed (`:211-220`). The Work table collapses each page with `collapseSiblings` (`components/work/task-table.tsx:27-35`) and adjusts the footer (`components/work/work-table.tsx:91-99`).
  - `countTasks` counts unshared records plus distinct keys (`query.ts:267-273`). `counters` (`:302-316`) and `departmentBreakdown` (`:340-378`) count **records**, not tasks.
  - A task's meeting counts the holder of every live record as the task's people (`lib/task-meetings.ts:11-21`).

### Private tasks

- **Rule:** `isPrivate` is true if and only if `projectId` is null and `ownerId` is set (`schema.prisma:449-453`). `ownerId` is set to null when the owner is deleted (`:456-457`). Every private task, including steps, carries `personalProjectId` (`:458-463`). The database does not enforce any of this.
- **Created** only by the private path of `POST /api/tasks`: `projectId` null, `isPrivate` true, `ownerId`, `personalProjectId`, no holder (`app/api/tasks/route.ts:150-172`).
- **Access:** every access check allows the owner only (`lib/work/access.ts:105`, `:120`, `:135`, `:160`, `:178`). Nobody may assign it (`:148`; `lib/work/tasks.ts:482`; `app/api/tasks/[id]/route.ts:41`). It has no team (`tasks.ts:472`) and no milestone (`app/api/tasks/[id]/route.ts:42`). Anyone else gets 404 (`:40`).
- **Lists:** every queue starts from `LIVE`, which means not deleted, not private and not a step (`lib/work/query.ts:15`).
- **Deleting a personal project** hard-deletes its tasks (`app/api/my-space/projects/[id]/route.ts:40`).
- **Gap:** deleting a user removes their personal projects (`schema.prisma:544`) and sets `ownerId` and `personalProjectId` to null (`:457`, `:463`), but the user delete does not remove their private tasks (`app/api/users/[id]/route.ts:195-204`). Those rows stay `isPrivate = true` with no owner, and nobody can open them.

### Deleted tasks are kept and can come back

- **Delete is soft:** `deletedAt` (`schema.prisma:429`). `deleteWork` stamps the task and all its steps with one shared time (`lib/work/tasks.ts:667-670`) and records a `deletedAt` change (`:671`). It needs `canDeleteTask` (`:666`; `lib/work/access.ts:158-165`). Route: `DELETE /api/tasks/[id]` (`app/api/tasks/[id]/route.ts:50-53`).
- **Bring back:** `PATCH` with `deletedAt: null` (`lib/validation.ts:342`). `updateWork` clears `deletedAt` on every row in the same scope that has the same stamp (`tasks.ts:413-422`, `:418`), needs `canDeleteTask` (`:415`) and records the change (`:419`).
- **While deleted:** the task reads 404 (`:63`, `:585`) and other edits get 409 (`:423`). Queues skip it (`query.ts:15`).
- **What still works while deleted:** `requireSee` has no `deletedAt` check (`lib/work/tasks.ts:71-76`), and these routes rely on it alone: note POST (`app/api/tasks/[id]/comments/route.ts:20`), team note (`app/api/tasks/[id]/work-notes/route.ts:21`), files (`app/api/tasks/[id]/attachments/route.ts:22`) and pin (`app/api/tasks/[id]/attachments/[activityId]/route.ts:33`), activity and history GET (`app/api/tasks/[id]/activity/route.ts:20`; `app/api/tasks/[id]/history/route.ts:14`), meetings GET (`app/api/tasks/[id]/meetings/route.ts:19`), meeting create (`app/api/events/route.ts:49`), and `/api/comments` with TASK (`app/api/comments/route.ts:46`, `:68`). So anyone who could see the task can still read its history, write notes that send messages (`app/api/tasks/[id]/comments/route.ts:28`), attach files and schedule meetings on it. Only the add-people POST refuses (`app/api/tasks/[id]/people/route.ts:64`). Trace 2's tester note is the file-open case.
- **Remove person from a shared task** also soft-deletes (`people/route.ts:137`), but writes no history row.
- **Hard deletes** happen only by cascade: when a project is deleted (`schema.prisma:412`) or through the personal-project delete above.

### Notes: `Comment` versus `TaskActivity`

- **`Comment`** holds PROJECT and MILESTONE threads. It points at its target with `targetType` + `targetId` and has **no foreign key** (`schema.prisma:388-404`; `:390-391`; index `:403`). The enum still includes TASK (`:39-43`).
  - New task notes are not Comments: `POST /api/comments` with TASK writes a `TaskActivity` through `addNote` (`app/api/comments/route.ts:67-73`), and `GET` reads the task's activity stream (`:45-50`).
  - Old TASK Comment rows are still counted on Today (`app/api/today/route.ts:73`) and removed when their project is deleted (`app/api/projects/[id]/route.ts:121`).
  - With no foreign key, deletes clean up by hand: a project delete removes its project, milestone and task Comments (`projects/[id]/route.ts:112-132`); a milestone delete removes its Comments (`app/api/milestones/[id]/route.ts:66-70`).
  - Who may read and write is decided in `lib/comments.ts:11-23`. When the author is deleted, `authorId` is set to null and the note stays (`schema.prisma:392-394`), shown as "Someone who left" (`lib/serialize.ts:278`, `:291`).
- **`TaskActivity`** is a task's full history (`schema.prisma:985-1013`).
  - Types: COMMENT, WORK_NOTE, FIELD_CHANGE, SYSTEM, ATTACHMENT, EMAIL, MENTION (`:139-147`). Visibility is PUBLIC or INTERNAL, default PUBLIC (`:150-153`, `:995`).
  - `addNote` (`lib/work/activity.ts:187-205`): files with no words make an ATTACHMENT row; otherwise a team note is WORK_NOTE and anything else is COMMENT (`:189`). A team note is INTERNAL (`:196`). Mentions go in metadata (`:198`).
  - `recordChanges` writes one PUBLIC FIELD_CHANGE row per changed tracked field (`:134-163`; fields `:45-65`). `recordSystem` writes a PUBLIC SYSTEM line (`:166-171`).
  - Non-staff read PUBLIC rows only (`:220`), and note counts follow the same rule (`:228-236`). Staff are decided by `isStaffOnTask` (`lib/work/access.ts:113-126`); someone who only asked for the task does not see INTERNAL notes.
  - Deleting a note: its author or the FOUNDER, and only COMMENT, WORK_NOTE or ATTACHMENT rows (`app/api/comments/[id]/route.ts:20`, `:26-27`).
  - Pinned files: `pinnedAt` (`schema.prisma:1003-1006`, index `:1012`) is set or cleared only by `PATCH /api/tasks/[id]/attachments/[activityId]`, for staff on the task (`app/api/tasks/[id]/attachments/[activityId]/route.ts:33-36`, `:48`). The same call can replace the row's `body` with a description (`:49`), with no author check, so staff can rewrite the words of someone else's note. A row without `attachmentUrl` gets 400 (`:43`).

### Files

- **Rows:** a note carries at most 10 files (`lib/note-files.ts:10`; `lib/validation.ts:184`). Each file is a `CommentAttachment` row with exactly one of `commentId` or `activityId`, ordered by `orderKey` (`schema.prisma:672-692`). The database does not enforce "exactly one": both columns are nullable (`:678-681`). Rows are deleted with their note (`:679`, `:681`).
- **Legacy first-file columns:** `Comment` and `TaskActivity` still keep the first file in `attachmentUrl`/`Name`/`Type` (`schema.prisma:396-400`, `:998-1002`), written by `firstFileColumns` (`lib/note-files.ts:25-28`). `attachmentsOf` reads the rows, or falls back to those columns for older notes (`lib/serialize.ts:271-275`).
- **Bytes, limits and serving:** Blob when `BLOB_READ_WRITE_TOKEN` is set (`lib/uploads.ts:82-97`), else a `StoredFile` row served at `/api/uploads/<id>` (`uploads.ts:98-103`), with the limits at `:14`, `:19`, `:25-35`, `:38-41`, `:46-48`, `:51-60`. See Architecture §10; `GET /api/uploads/<id>` (`app/api/uploads/[name]/route.ts:22-44`) is followed in Trace 2.
- **`StoredFile` itself** (`prisma/schema.prisma:659-670`): the bytes sit in a `Bytes` column (`:664`). `type` is what the browser sent, cut to 120 characters (`lib/uploads.ts:99`). `createdById` is nullable with no relation (`schema.prisma:665`); it feeds the hourly limits through `@@index([createdById, createdAt])` (`:669`; `lib/uploads.ts:54`). A file counts as in use only when its exact URL string sits in one of five columns (`lib/uploads.ts:136-148`). Only `CommentAttachment.url` is indexed (`schema.prisma:691`); `Comment.attachmentUrl` (`:396`), `TaskActivity.attachmentUrl` (`:998`), `Project.logoUrl` (`:290`) and `Task.deliverableUrl` (`:430`) are scanned whenever someone other than the uploader opens a file (`lib/file-access.ts:26`, `:33-36`). Backups write the bytes as base64 JSON lines (`scripts/backup-database.ts:4-5`, `:13`; `scripts/prod-backup.ts:9-11`, `:55-61`).
- **`releaseFiles`** (`uploads.ts:166-173`) deletes the `StoredFile` rows behind the given URLs unless something still points at them: a `CommentAttachment`, a first-file column on `Comment` or `TaskActivity`, `Project.logoUrl` or `Task.deliverableUrl` (`:136-148`). Callers: note delete (`comments/[id]/route.ts:22`, `:29`), milestone delete (`milestones/[id]/route.ts:75`) and project delete (`projects/[id]/route.ts:141`).
- **Daily sweep:** `sweepUnusedFiles` removes `StoredFile` rows older than 24 hours that nothing points at (`uploads.ts:155-163`), inside the snooze-wake cron (`app/api/cron/snooze-wake/route.ts:70-73`, `vercel.json:8-9`). Neither this nor `releaseFiles` touches Blob files; both handle only `/api/uploads/` addresses (`uploads.ts:167`).

### Meetings

- **`CalendarEvent`** (`schema.prisma:587-618`): `isMeeting = true` means a meeting with its own list of attendees (`:596-598`). Links: `projectId` (`:599-600`); `milestoneId`, set when the meeting is a milestone review (`:601-603`); `taskId`, set when it was scheduled from a task (`:605-607`). All three are set to null when the linked row is deleted. `createdBy` blocks deleting its user (Restrict) (`:608-609`).
- **`EventAttendee`** (`:624-637`): one row per person per meeting (`:635`). `response` is "YES", "NO" or null (`:630-633`). Deleted with the meeting and with the user (`:627`, `:629`).
- **Create** (`app/api/events/route.ts:32-79`): managers only (`:34`). A task meeting needs the scheduler to see the task (`:49`). Invitees are filtered by what the meeting is for (`:54-58`); for a task meeting that means only the task's people plus the organiser, and active accounts only (`lib/task-meetings.ts:24-28`).
- **Reading:** every meeting DTO carries every attendee's name and reply (`lib/serialize.ts:327`, `:352-357`, `:378`). `GET /api/calendar`: the CEO sees every meeting; a CO_FOUNDER, HOD or MANAGER sees the meetings on projects they can see, plus their own; everyone else sees only meetings they attend or organise (`app/api/calendar/route.ts:49-63`). `GET /api/tasks/[id]/meetings` is wider: every meeting on the task, with all replies, for anyone who can see the task, attendee or not (`app/api/tasks/[id]/meetings/route.ts:17-25`).
- **Milestone review meeting:** `Milestone.reviewEventId` is unique and set to null when the meeting is deleted (`schema.prisma:355-356`). It is set in `lib/meetings.ts:109`.
- **Replies** — two routes write the same column:
  - **Signed link:** an HS256 token whose subject is the attendee row id, with purpose `meeting-reply` and the reply inside, valid for 7 days (`lib/meeting-reply.ts:13`, `:23-30`, `:33-43`). The public page writes the reply (`app/r/[token]/page.tsx:33-34`).
  - **Signed in:** `POST /api/events/[id]/reply`, for attendees only (`app/api/events/[id]/reply/route.ts:28-37`).
  - A "NO" sends the organiser a notification (`page.tsx:35-43`; `reply/route.ts:39-47`). Moving the date clears every reply (`app/api/events/[id]/route.ts:90`; `app/api/events/[id]/reschedule/route.ts:48`; `lib/meetings.ts:124`).
- **Task lists** show the soonest meeting ahead, today included (`lib/work/query.ts:164-176`), and can filter by it (`:89`).

### A department's head

- **Where it is stored:** `Department.hodId`, set to null when that person is deleted (`schema.prisma:247-250`). Head powers need both the HOD role and `Department.hodId` (`lib/work/access.ts:63`, `:70`; `lib/project-visibility.ts:32`, `:92`; `lib/project-people.ts:106`; `lib/permissions.ts:161`, `:199`; `lib/work/org.ts:42`, `:50`; `app/api/departments/[id]/route.ts:39`). The role alone gives none, and `hodId` alone gives none; the comment at `lib/department-heads.ts:9-12` says otherwise.
- **`syncDepartmentHead`** (`lib/department-heads.ts:21-48`):
  - Not an HOD, or disabled: `hodId` is cleared on every department they head (`:37-40`).
  - Moved to another department: the old department loses them as head (`:41`).
  - Unplaced: nothing more happens (`:42`).
  - Placed: they become head only if the department has none (`:44-45`). A department that already has a head keeps it (`:18-19`).
- **When it runs:** on every invite (`lib/invite-people.ts:60`; `app/api/users/route.ts:133`; `lib/project-invites.ts:99`), and when a person's role, department or disabled flag changes (`app/api/users/[id]/route.ts:148-150`). A PENDING invitee can become a head.
- **By hand:** only the CEO picks a head, an HOD account that is not disabled; status is not checked, so an invited HOD counts (`app/api/departments/[id]/route.ts:51-65`). A head may edit only their own department's description (`:66-73`).
- **Department delete:** executive roles only (`:90-92`). Refused with 409 while it holds projects (`:99-105`), people or teams (`:108-115`).

### Invite tokens

- **`issueInvite`** (`lib/invite.ts:43-85`): the token is 32 random bytes (`:21-23`). Only its sha256 is stored (`:26-28`, `:54`). It expires after 72 hours (`:16`, `:31-33`). It upserts on `userId`: a new invite replaces the token and resets the expiry and `consumedAt`, so the old link stops working (`:57-61`). The raw link goes back to the inviter so they can pass it on by hand (`:63-64`, `:84`).
- **Schema:** one invite per user (`userId @unique`, `schema.prisma:696`); `tokenHash @unique` (`:698`).
- **Validate** (`app/api/invite/[token]/validate/route.ts:24-28`): unknown gives 404; consumed or expired gives 410.
- **Accept** (`app/api/invite/[token]/accept/route.ts:29-66`): looks the token up by its sha256 (`:36-37`). A dead link returns 410 with a `state` (`:40-51`): `unknown` for no such token, for example one replaced by a newer link (`:41`), or a switched-off account (`:43-44`); `expired` (`:42`); `consumed` (`:51`). **Single use:** an atomic update that only succeeds while `consumedAt` is still null (`:47-51`). It then sets the password and makes the account ACTIVE (`:53-56`), and signs the person in with a fresh cookie (`:59-65`).
- **Mismatch:** accept checks expiry before use, but validate checks use before expiry. A link that is both used and expired shows "consumed" on the page and "expired" on submit.
- **Other routes that issue the same kind of link:** Resend, for PENDING accounts only (`app/api/users/[id]/resend/route.ts:35-37`, `:48-53`); a forgot-password resolve (`app/api/password-reset/[id]/resolve/route.ts:32-41`). Setting a password by hand deletes the person's invite (`app/api/users/[id]/password/route.ts:37`).

### `sessionVersion`

- **How it works:** every session token carries `User.sessionVersion` (`schema.prisma:217-218`; `lib/auth.ts:22-23`). Tokens are made at sign-in (`app/api/auth/route.ts:71`), at first-run setup (`bootstrap/route.ts:110`) and on invite accept (`accept/route.ts:59`). Each request loads the user and rejects a disabled account (`lib/session.ts:30`) or a token with the wrong version (`:32`).
- **Increased by:** changing your own password, where that session gets a new cookie (`app/api/users/me/password/route.ts:45`, `:49`); a reset from People (`app/api/users/[id]/route.ts:141-142`), refused for your own account (`:61`); setting a password by hand (`app/api/users/[id]/password/route.ts:36`).
- **Not increased by** a role change, so the middleware keeps walling by the old role until the person signs in again (Trust boundaries §1).
- **Gap:** accepting an invite link does not increase it (`accept/route.ts:53-56`). A forgot-password reset goes through that link (`password-reset/[id]/resolve/route.ts:32-36`), so sessions opened before the reset keep working.

### What makes a send happen once

- **Bell:** `Notification.dedupeKey` is `@unique` (`prisma/schema.prisma:763-765`); rows are written with `createMany` and `skipDuplicates` (`lib/notify.ts:55-67`).
- **Email:** `EmailLog.dedupeKey` is `@unique` (`prisma/schema.prisma:718`), and the row is reserved before sending (`lib/email.ts:99-105`).
- **WhatsApp:** `WhatsAppLog.dedupeKey` is `@unique` (`prisma/schema.prisma:734`; `lib/whatsapp.ts:165-172`).
- **Push:** one subscription row per browser, `PushSubscription.endpoint` `@unique` (`prisma/schema.prisma:572`).

### Relations that refuse a delete

| Relation | Rule | Where |
|---|---|---|
| `CalendarEvent.createdBy` → User | Restrict | `schema.prisma:608-609`; `prisma/migrations/20260728140000_phase8_calendar_events/migration.sql:45` |
| `RoutineCollaborator.invitedBy` → User | Restrict | `schema.prisma:809-810`; `prisma/migrations/20260830120000_phase39_routine_collaborator/migration.sql:25` |
| `Invite.createdBy` → User | no `onDelete` on a required relation, so Restrict | `schema.prisma:701-702`; `prisma/migrations/20260729090000_phase10_invites/migration.sql:34` |

- **User delete** reassigns all three to the person doing the delete, then deletes the account, in one transaction (`app/api/users/[id]/route.ts:195-204`). Before that it refuses deleting your own account (`:171-173`), an account that owns a project with 409 (`:180-189`), and the last active account that can run projects (`:191-193`). A PENDING account is deleted straight away (`:175-177`).
- **`Task.completedBy`** also has no `onDelete`, but it is optional, so it is SET NULL (`schema.prisma:443`; `prisma/migrations/20260721135312_phase3_roles_notes_review/migration.sql:45`).

### Cascade and set-null (lines in `prisma/schema.prisma`)

| When this is deleted | Deleted with it (Cascade) | Set to null |
|---|---|---|
| User | ProjectMember 273, own PasswordResetRequest 373, PersonalDepartment 532, PersonalProject 544, PushSubscription 571, EventAttendee 629, UserEmail 650, own Invite 697, EmailLog 715, WhatsAppLog 731, Notification 745, Person 783/785, RoutineCollaborator.manager 806, AssignmentGroupMember 943 | Department.hodId 250, .createdById 252; Project.leadId 317, .ownerId 324; PasswordResetRequest.resolvedById 379; Comment.authorId 394; Task.givenById 441, .completedById 443, .assigneeId 445, .ownerId 457, .requesterId 483, .resolvedById 495, .closedById 498; AssignmentGroup.leadId 926; TaskActivity.authorId 993 |
| Department | AssignmentGroup 922 | User.departmentId 206, Project.departmentId 330, Task.departmentId 486, TaskCategory.departmentId 960 |
| Project | ProjectMember 271, Milestone 346, Task 412 | CalendarEvent.projectId 600 |
| Milestone | none | Task.milestoneId 434, CalendarEvent.milestoneId 603 |
| Task (hard delete) | its steps 414, TaskActivity 991 | CalendarEvent.taskId 607, Notification.taskId 760 |
| CalendarEvent | EventAttendee 627 | Milestone.reviewEventId 356 |
| Comment / TaskActivity | CommentAttachment 679 / 681 | none |
| AssignmentGroup | AssignmentGroupMember 941 | Task.assignmentGroupId 488, TaskCategory.assignmentGroupId 962 |
| TaskCategory | child categories 957 | Task.categoryId 475 |
| PersonalDepartment / PersonalProject | PersonalProject 546 / none | none / Task.personalProjectId 463 |
| Person | RoutineCollaborator 804, HabitSegment 823 (then Habit 836, HabitMark 851), NonNegotiable 863 (then NonNegotiableMark 878), WeightEntry 894, RoutineTask 907 | none |

- **No foreign key at all:** `Comment.targetId` (391), `Notification.eventId` (762), `StoredFile.createdById` (665), and every file URL string.
- **What routes do on top of the schema:** a project delete removes its Comments and meetings first (`app/api/projects/[id]/route.ts:131-138`). A milestone delete moves its tasks out and removes its Comments and review meeting (`app/api/milestones/[id]/route.ts:67-74`). A department delete is refused while it holds anything, so the team cascade never runs from the app (`app/api/departments/[id]/route.ts:99-115`).

### What `scripts/check-data-integrity.ts` enforces

The script is read-only (`:5`). Each check prints OK, or BAD with up to five offenders (`:13-19`).

| Invariant (exact name) | Line | What it tests | What keeps it true, or code that can break it |
|---|---|---|---|
| every note was written by somebody who can see the task | `:47` | Each COMMENT or WORK_NOTE author (`:27-33`) is FOUNDER or CO_FOUNDER, on the task, in its department, a project member or the department head (`:38-44`) | Stricter than `canSeeTask` in two ways: it ignores team membership (`lib/work/access.ts:107`) and seeing a project without being a member (`:109`), so those authors show as BAD. Looser in one: any CO_FOUNDER passes (`scripts/check-data-integrity.ts:38`), though `canSeeTask` gives a co-founder only department and project scope (`lib/work/access.ts:58`), so his note on a task outside that scope shows OK |
| no task is 'shared' with only itself | `:51` | Every live `siblingKey` has at least two live records (`:50`) | `deleteWork` soft-deletes one record and keeps the key (`lib/work/tasks.ts:660-676`). Only remove-person clears it (`app/api/tasks/[id]/people/route.ts:139-141`). A New Task batch that fails after its first record also leaves one (`components/work/new-work-sheet.tsx:148`) |
| every held task has an assigned date | `:55` | A live task with a holder has `assignedAt` | Broken by Start Work on a task nobody holds: it sets the holder, not `assignedAt` (`lib/work/tasks.ts:611-615`) |
| no unheld task claims an assigned date | `:57` | A live task with no holder has no `assignedAt` | Broken by Return to Queue: it clears the holder, not `assignedAt` (`lib/work/tasks.ts:617-619`) |
| a task sits in its project's department | `:63` | A live task's `departmentId` equals its project's (`:60-62`) | Moving a project does not move its tasks (`app/api/projects/[id]/route.ts:64-86`). `updateWork` accepts a `departmentId` on a project task (`lib/work/tasks.ts:441`) |
| nobody disabled is still holding a task | `:67` | No live task is held by a disabled account | Disabling only sets `disabledAt` (`app/api/users/[id]/route.ts:127`). Nothing releases that person's tasks |
| no address belongs to two people | `:74` | Lower-cased addresses are unique across `User.email` and `UserEmail.email` | `takenEmails` checks before writing (`lib/user-emails.ts:67-79`; `lib/invite-people.ts:50-51`). The database only has a unique index per table (`schema.prisma:160`, `:648`) |
| every project is in a department | `:78` | `Project.departmentId` is not null | Project PATCH refuses null (`app/api/projects/[id]/route.ts:65-66`). Department delete refuses while it holds projects (`app/api/departments/[id]/route.ts:99-105`). The column is still nullable (`schema.prisma:329-330`) |
| there is exactly one CEO | `:82` | Exactly one FOUNDER | First-run setup (`app/api/auth/bootstrap/route.ts:75-95`). No FOUNDER can be created from the app (`lib/permissions.ts:108-110`) |
| there is at most one admin | `:84` | No more than one ADMIN | The single-admin guard (`lib/account-guards.ts:3-15`) |
| every active account has a password | `scripts/check-data-integrity.ts:88` | ACTIVE and not disabled means `passwordHash` is set | Invitees are PENDING with no password (`lib/invite-people.ts:57`). Accept and set-by-hand set the password and ACTIVE together (`app/api/invite/[token]/accept/route.ts:53-56`; `app/api/users/[id]/password/route.ts:36`) |

**Not checked by the script:** `isPrivate` if and only if `projectId` is null and `ownerId` is set (`schema.prisma:449-450`), which deleting the owner breaks (see Private tasks); a `CommentAttachment` has exactly one of `commentId` or `activityId` (`schema.prisma:673-674`); `status = statusOf(state)` (`lib/work/workflow.ts:33-47`).

## Trust boundaries

### 1. Where a request is authenticated

A request becomes a person in five steps. Steps 1–3 happen in the middleware; steps 4–5 happen in every API route.

1. **Cookie.** The browser sends `orbit_session` (`lib/auth.ts:3`): httpOnly, SameSite lax, secure in production, path `/`, 30 days (`lib/auth.ts:4`, `lib/auth.ts:75-85`). Page script cannot read it.
2. **JWT.** HS256, signed with `AUTH_SECRET`, which must be at least 16 characters (`lib/auth.ts:26-32`). It carries `sub` = user id, `role`, `name` and `v` = sessionVersion, and expires after 30 days (`lib/auth.ts:35-42`). `readSessionToken` returns nothing for a missing, badly signed or expired token (`lib/auth.ts:53-58`, `:69-71`), or when the subject is missing or the role is not in `ROLES` (`:63-65`). A token without `v` reads as version 0 (`:67`).
3. **Middleware** verifies the token and nothing else, never reading the database (`middleware.ts:20`; Architecture §2).
4. **User row.** `requireUser` → `loadSessionUser` checks the token again, then loads the user by id on every request (`lib/session.ts:24-29`). No row, or `disabledAt` is set → 401 (`lib/session.ts:30`).
5. **sessionVersion.** If `user.sessionVersion` differs from the token's `v` → 401 (`lib/session.ts:32`). Then a PERSON gets 403 (`lib/session.ts:45-50`).

**The role comes from the database.** Routes read the role from the user row, never from the token; the token's role only drives the middleware's redirects and walls. A reset by an account admin bumps sessionVersion (`app/api/users/[id]/route.ts:142`); a role change does not, so the middleware keeps using the old role until the person signs in again.

**Where a cookie is issued:**
- **Sign-in** (`app/api/auth/route.ts:32-86`): 8 failed attempts a minute per IP, counted in the database (`lib/login-attempts.ts:4-5`, `:29-34`). The IP is the first `x-forwarded-for` entry (`lib/login-attempts.ts:8-12`), stored only as a hash keyed with AUTH_SECRET (`:18-22`). Any of the person's addresses signs them in (`app/api/auth/route.ts:50-51`, `lib/user-emails.ts:49-61`). A disabled account, or an invited one with no password yet, answers exactly like a wrong password (`app/api/auth/route.ts:53-63`). Success clears the failures (`:78`); sign-out clears the cookie (`:89-93`).
- **First run** (`app/api/auth/bootstrap/route.ts:35-119`): the same rate limit (`:36-48`), 410 once any user exists (`:50-56`), and `APP_PASSCODE` (`:61-64`, `lib/auth.ts:91-102`). The serializable transaction makes the FOUNDER (`app/api/auth/bootstrap/route.ts:77-80`) and the default departments (`:83-91`; Data and invariants); any failure in it returns 410, so two first visits make one CEO (`:96-102`). It then signs the CEO in (`:106-117`). `GET` tells the login page whether first-run setup is still needed (`:122-125`).
- **Invite accept** (`app/api/invite/[token]/accept/route.ts:29-66`): a dead link returns 410 with a `state` (`:40-51`); the invite is claimed atomically (`:47-51`), the password set and the account made ACTIVE (`:53-56`), and the person signed in (`:59-65`). Links last 72 hours and a resend replaces the token (`lib/invite.ts:16`, `lib/invite.ts:57-61`); the rest is under Data and invariants → Invite tokens.
- **Own password change** (`app/api/users/me/password/route.ts:21-51`): proves the current password (`:29-40`), bumps sessionVersion (`:45`) and sets a fresh cookie (`:48-50`).

**In the browser**, any 401 from `apiGet`, `apiPost` and the other helpers sends the page to `/login` (`lib/api.ts:19-22`).

### 2. Where each kind of rule is enforced

The middleware only redirects or walls (Architecture §2). Every API route checks again on the server: routes are thin, checks throw `HttpError`, and `route()` turns it into JSON (`lib/session.ts:105-124`).

| Rule | Server check | What the browser mirrors (courtesy only) |
|---|---|---|
| Signed in, account live | `requireUser` `lib/session.ts:45-51` | redirect on 401 `lib/api.ts:19-22` |
| PERSON touches no work | `middleware.ts:27-29`; `lib/session.ts:47-49`; `lib/work/access.ts:54-56`; `lib/project-visibility.ts:21-23` | — |
| ADMIN has no projects or tasks | `lib/work/access.ts:54-56`; `lib/project-visibility.ts:24-26` (the middleware redirect covers pages only) | Work list not fetched for admin `components/work/work-page.tsx:228` |
| Well Being is the CEO's | `middleware.ts:61-66`; `requireManager` `lib/session.ts:66-72` | — |
| See a task (404 if not) | `canSeeTask` `lib/work/access.ts:104-111`. Lists use the same rule as a WHERE clause, `lib/work/query.ts:18-30`. 404 from `lib/work/access.ts:228-230` | — |
| Edit, assign, delete, move a task | `lib/work/access.ts:134-205`, called in `lib/work/tasks.ts:427-429`, `:601-605`, `:666` | `access` from `taskAccess` `lib/work/access.ts:216-225` hides buttons in `components/work/work-record.tsx:75`, `:109-111`, `:117`, `:268`, `:275` |
| Who may hold a task | `assertAssigneeAllowed` `lib/work/assignment.ts:93-132` | picker list `components/work/work-sheets.tsx:49-57` |
| See a project | `lib/project-visibility.ts:20-58` | — |
| Run a project | `canManageProject` `lib/project-people.ts:98-108` (counts the lead since 9c3eafd, `:105`) | — |
| Accounts, positions, placement | `lib/permissions.ts:104-206`, called in `app/api/users/route.ts:87`, `:118`; `app/api/users/[id]/route.ts:58`, `:71`, `:121`; `lib/invite-people.ts:42-45` | `rolesOfferedTo` `components/people/person-sheet.tsx:24-32`; placeable list `components/people/invite-sheet.tsx:37-43` |
| Departments | create `app/api/departments/route.ts:57-60`; edit `app/api/departments/[id]/route.ts:38-42`; delete `:88-115` | — |
| Teams | `lib/work/org.ts:40-52`: the CEO or the department's head shapes teams (`:40-44`), a team's lead also changes its members (`:47-52`), and members are work accounts that are not disabled, invited included (`:74-78`) | — |
| Open a file | `canOpenFile` `lib/file-access.ts:25-58`, called in `app/api/uploads/[name]/route.ts:31` | — |
| Notes | Writing a note needs only `requireSee` (`app/api/tasks/[id]/comments/route.ts:20`); a team note also needs `isStaffOnTask` (`app/api/tasks/[id]/work-notes/route.ts:22`); deleting is the author or the FOUNDER (`app/api/comments/[id]/route.ts:20`, `:27`) | — |
| Meetings | Create needs `assertManager` (`app/api/events/route.ts:34`) plus `canSeeProject` or `requireSee` (`:44`, `:49`); reading follows the calendar rule (`app/api/calendar/route.ts:49-63`; Data and invariants → Meetings) | — |
| Bell | Every query is limited to the caller's own rows (`app/api/notifications/route.ts:45-56`; `app/api/notifications/[id]/snooze/route.ts:30-36`) | — |
| Uploads | Any account `requireUser` admits may upload, the admin included (`app/api/uploads/route.ts:19`) | — |
| My space | Every query is limited to the owner's rows by `ownerId` (`app/api/my-space/departments/route.ts:19`, `:36`; `app/api/my-space/projects/[id]/route.ts:11-13`; `app/api/my-space/prompt/route.ts:26`) | — |
| Crons | `CRON_SECRET` is compared with `!==` (`app/api/cron/tomorrow/route.ts:19`; `app/api/cron/snooze-wake/route.ts:37`), not the constant-time comparison the passcode uses (`lib/auth.ts:91-102`) | — |
| Project running rights | Anyone who runs a project can grant `canManage` to any member through the `userId` body (`app/api/projects/[id]/members/route.ts:20-21`, `:61`, `:117-120`) | — |

**What the browser is trusted with:** its cookie, what the DTOs below reveal, and the following.
- **Push endpoint:** the browser sends any URL as its push endpoint (`app/api/push/subscribe/route.ts:12`), and the server later POSTs to it (`lib/push.ts:62-65`). The upsert on `endpoint` moves an existing subscription to whoever sends it (`app/api/push/subscribe/route.ts:31-33`).
- **File URLs:** a note's file may be any http(s) URL (`lib/validation.ts:156-160`). When its name or type says picture, the note thumbnail loads it straight into every viewer's browser (`components/notes/note-files.tsx:47`, `:52-62`); only the full-screen viewer checks `previewable` (`components/work/attachment-viewer.tsx:144`; `lib/file-kinds.ts:36-38`). The `/api/uploads` branch accepts any `[A-Za-z0-9._-]+` name (`lib/validation.ts:160`), looser than the id shape checked on read (`lib/uploads.ts:108`) and on `deliverableUrl` (`lib/validation.ts:350`).
- **localStorage:** `components/today/setup-card.tsx:12`, `components/calendar/calendar-view.tsx:51`, `components/first-run-hint.tsx:37`, `components/pwa/push-ask.tsx:46`, `components/pwa/install-prompt.tsx:26`, `lib/hooks/use-collapse.ts:19`.
- **Caches:** an in-memory React Query cache that is not persisted (`components/providers.tsx:8-22`), and a service worker that caches only the app shell, never API data (`public/sw.js:11-19`, `:40-44`).

The `access` object only hides buttons; every write runs the same check again inside the route, as `lib/permissions.ts:4-6` states. The role in the token is never used by a route.

### 3. What the DTOs reveal, and to whom

`serializeUser` never includes passwordHash (`lib/serialize.ts:148-171`).

| DTO / route | Who may call it | Emails | Phone | Also carries |
|---|---|---|---|---|
| `GET /api/users` (`app/api/users/route.ts:30-75`) | Team lead and above, and the admin (`lib/permissions.ts:94-96`, `lib/roles.ts:59-60`). A team member gets 403. | Main address and every extra address (`lib/serialize.ts:156-159`) | Real value only for account admins (CEO, co-founder, head, manager, admin: `lib/roles.ts:66-67`) and for the person themselves. `null` for everyone else (`app/api/users/route.ts:67-73`). | Role, status (ACTIVE/PENDING), disabledAt, emailOptIn, whatsappOptIn, department. **Rows:** the CEO, a co-founder and the admin see everyone except PERSON accounts (`:40`, `:44-45`). Others see their own department, departments they head, the CEO and co-founders, and themselves (`:41-53`). |
| `GET /api/users/me` (`app/api/users/me/route.ts:15-20`) | self | own | own | `hasFamily` |
| `PATCH /api/users/:id` response (`app/api/users/[id]/route.ts:151-154`) | account admin over that person | yes | yes | `tempPassword` after a reset (`:131-135`) |
| `POST /api/users/invite` (`app/api/users/invite/route.ts:31-32`, `lib/invite-people.ts:61-62`) | anyone who passes the position check | the new person's main address | — | **The set-password link.** Whoever holds it can set the password for 72 hours. The same link comes back from `POST /api/users` (`app/api/users/route.ts:141-144`), Resend (`app/api/users/[id]/resend/route.ts:55`) and New project (`app/api/projects/route.ts:147`). |
| Project people, `GET /api/projects/:id/members` (`app/api/projects/[id]/members/route.ts:49-55`) | anyone who can see the project | no | no | id, name, role, department name, lead/owner/member flags, `invited`, task count (`lib/project-people.ts:41-55`) |
| Teams, `GET /api/assignment-groups` (`app/api/assignment-groups/route.ts:13-19`) | every work account; ADMIN and PERSON are refused by `loadScope` (`:15`) | no | no | Every team in the company. Members as id, name and role, active and invited (`lib/work/org.ts:34`). |
| Task (`lib/serialize.ts:52-125`) | whoever passes `canSeeTask` | no | no | Names of holder, giver, requester, resolver and completer (`lib/serialize.ts:38-48`, `:75`), plus department, team, category and project names (`:98`, `:106`, `:108`, `:119`). `alsoWith` names (`lib/work/query.ts:186-206`, `app/api/work/[number]/route.ts:24-36`). |
| Activity (`lib/work/activity.ts:26-42`) | `requireSee`; team notes only for staff (`app/api/tasks/[id]/activity/route.ts:20-24`, `lib/work/activity.ts:220`) | no | no | author id, name, role (`lib/work/activity.ts:23`) |
| Sign-in, first run, accept responses (`app/api/auth/route.ts:80-83`, `app/api/auth/bootstrap/route.ts:113-116`, `app/api/invite/[token]/accept/route.ts:60-63`) | the person signing in | own | no | id, name, role |
| `GET /api/org/setup` (`app/api/org/setup/route.ts:12-24`) | CEO only (`:14`) | no | no | counts only |

**Tester notes:**
- `siblingKey` is whatever the client sends (`lib/validation.ts:212`, `lib/work/tasks.ts:349`). Records that share a key list each other's holders by name (`lib/work/query.ts:186-206`).
- The task DTO returned after a write is built with `staff = true` (`lib/work/tasks.ts:573`), so its `noteCount` includes team notes (`lib/work/activity.ts:228-235`).

### 4. What the client may send

JSON bodies go through `parseBody`: non-JSON → 400 "Body must be JSON"; a schema failure → 400 with the issues (`lib/validation.ts:355-374`). Two routes do not: Resend reads `{email}` without a schema and treats a bad body as `email: true` (`app/api/users/[id]/resend/route.ts:26-27`), and uploads are multipart (`app/api/uploads/route.ts:21`). At 9c3eafd an `orderKey` is any non-empty string (`lib/validation.ts:205`, `:336`); the uncommitted working tree checks it is a real fractional-indexing key (`orderKeySchema`, `lib/validation.ts:50-66` there). A zod object drops any key it does not name; no schema in `lib/` or `app/` uses `passthrough` or `strict`.

**Tasks**
- **Assign** (`lib/validation.ts:387-393`): only `assignmentGroupId` and `assigneeId`, both nullable, at least one present.
- **Change a task** (`lib/validation.ts:322-353`). `deletedAt` may only be `null`, which means undo and needs `canDeleteTask` (`:342`, `lib/work/tasks.ts:414-415`). `deliverableUrl` must be an http(s) link or `/api/uploads/c…` (`:346-351`). `progress` is 0–100 (`:341`). **Never accepted:** `state`, `number`, `projectId`, `isPrivate`, `ownerId`, `givenById`, `assignedAt`, `resolvedById`, `closedAt`, `siblingKey`. Explicit moves go through `transitionSchema` (`lib/validation.ts:377-386`) and the transition table (`lib/work/workflow.ts:14-26`). The legacy `status` word on PATCH (`lib/validation.ts:326`) also becomes checked moves (`lib/work/tasks.ts:566-568`, `:646-655`), and assigning changes state directly through `stateAfterAssignment`, with no move check (`lib/work/tasks.ts:503-506`; `lib/work/workflow.ts:95-99`).
- **Create a task** (`lib/validation.ts:188-213`). The client may send its own UUID `id` (`:189`), `requesterId` (`:195`) and `siblingKey` (`:212`). The server sets the starting `state` from whether someone holds it (`lib/work/tasks.ts:321`) and `givenById` to the actor (`:346`). A `status` in the body then moves it on, each move checked, so a client allowed those moves can create a task already Resolved (`lib/validation.ts:206`; `lib/work/tasks.ts:371-373`); a private task's owner is the caller (`app/api/tasks/route.ts:78-79`). **Tester note:** `requesterId` is used as sent (`lib/work/tasks.ts:283`), with no check against the caller's scope.
- **Notes and comments** (`lib/validation.ts:171-186`, `:396-406`). A file URL must be http(s) or `/api/uploads/<id>` (`:156-160`); at most 10 files (`lib/note-files.ts:10`). **Tester note:** the note routes do not check who uploaded an `/api/uploads` address (no `storedFile` or `canOpenFile` use in `app/api/comments`, `app/api/tasks` or `lib/note-files.ts`). So anyone who can open a file can widen who opens it by attaching its address to a note seen by more people (`lib/file-access.ts:39-42`).

**Accounts**
- **Your own account** (`app/api/users/me/route.ts:22-28`): only `name`, `emailOptIn`, `whatsappOptIn` and `phone`, which must be E.164 (`lib/validation.ts:23-33`). Changing your sign-in email needs your current password, and the address must be nobody else's (`app/api/users/me/email/route.ts:12-15`, `:29-38`). Never your own role, department, status or sessionVersion.
- **Someone else's account** (`app/api/users/[id]/route.ts:20-33`): `name`, `email`, `role`, `disable`, `reset`, `phone`, `departmentId`. Never `status` or `passwordHash`; a reset generates a temporary password on the server (`:131-135`).
- **Invite** (`app/api/users/invite/route.ts:10-24`): the role must be one of CO_FOUNDER, HOD, MANAGER, TEAM_LEAD, RESOURCE, or none (`:18`); 1–50 people, 1–10 addresses each (`:16`, `:22-23`). The server always sets `status` PENDING and `passwordHash` null (`lib/invite-people.ts:56-58`).
- **Create one account** (`app/api/users/route.ts:17-26`): any role name parses (`lib/validation.ts:37`). The server refuses FOUNDER and PERSON, ADMIN unless the actor is an admin (`lib/permissions.ts:108-120`), and a second ADMIN (`app/api/users/route.ts:88-90`).
- **First run** and **projects**: the role is always FOUNDER (`app/api/auth/bootstrap/route.ts:79`); a project's owner is always the caller (`app/api/projects/route.ts:117`).

**Uploads** (`app/api/uploads/route.ts:18-32`): size, kind and database caps, the browser-supplied stored type, and the uploader being the caller are in Architecture §10.

### 5. Who may give which position, and place people where

Ranks: FOUNDER 6, CO_FOUNDER 5, HOD 4, MANAGER 3, TEAM_LEAD 2, RESOURCE 1, ADMIN and PERSON 0 (`lib/roles.ts:77-86`). The source of truth is `assertCanCreateUserWithRole` (`lib/permissions.ts:104-131`) and `assertCanPlaceInDepartment` (`lib/permissions.ts:194-206`).

| Actor | May give (invite or create) | May place a new person in |
|---|---|---|
| CEO | Co-founder, Head, Manager, Lead, Member (`:112-114`, `:121-130`) | any department, or not placed (`:198`) |
| Co-founder | Head, Manager, Lead, Member (ceiling is its own rank − 1) | any department, or not placed |
| Head (HOD) | Manager, Lead, Member | Their own department or one they head (`:199-200`). "Not placed" → 400 (`:201-203`). Anywhere else → 403 (`:205`). |
| Manager | Lead, Member | Their own department only. Same refusals as a head. |
| Admin | Manager, Lead, Member (`:122-123`). No ADMIN can be created from the app: `POST /api/users` and PATCH refuse while any admin exists (`app/api/users/route.ts:88-90`; `app/api/users/[id]/route.ts:111-113`), counting any status and the acting admin (`lib/account-guards.ts:13-15`), and only an admin may try (`lib/permissions.ts:115-117`). | any department, or not placed |
| Lead, Member | nobody: 403 (`:105-107`) | — |

- **Nobody** may create a FOUNDER (`:108-110`) or a PERSON here (`:118-120`). A row with no position becomes a Team member (RESOURCE) (`lib/invite-people.ts:37`).
- **Edge case:** a head or manager with no department of their own may invite only people who are not placed (`lib/permissions.ts:201-204`).
- **Inviting several people** checks every row before writing anything, then creates the accounts one row at a time, not in one transaction (`lib/invite-people.ts:21-65`; Data and invariants → How an organisation's data starts).

**Changing an existing person** (`PATCH /api/users/:id`, gated by `requireAccountAdmin` at `app/api/users/[id]/route.ts:47`). Target rules (`lib/permissions.ts:150-186`): a PERSON never (`:157-159`); a head or manager reaches only people in their departments, or people not placed (`:160-167`); only an admin touches the admin account (`:168-170`) and only the CEO touches the CEO account (`:171-173`); otherwise the target must be strictly lower in rank (`:174-180`), and the admin reaches up to Manager (`:181-185`). The route's own checks (grant ceiling, FOUNDER fixed, PERSON never granted, placement on a move, no self-reset or self-disable, last project authority, the only admin cannot disable or demote itself `:97-105`) are listed in Architecture §4 under `/api/users/[id]`. Heads of department follow `syncDepartmentHead` (Data and invariants → A department's head); department create, edit and delete are in the Architecture §4 department rows.

**Placement through a project skips the placement check.**
- **New project** needs the manager chain (`app/api/projects/route.ts:63`, `lib/permissions.ts:51-53`). A head may start one only in the department they head (`:73-75`). Each invite row's position is checked (`:93-97`).
- **Add people** needs `canManageProject` (`app/api/projects/[id]/members/route.ts:61`).
- Both put new people in the project's department (`lib/project-invites.ts:82`). Neither calls `assertCanPlaceInDepartment`; only `lib/invite-people.ts:44`, `app/api/users/route.ts:118` and `app/api/users/[id]/route.ts:121` do. **Tester note:** a manager who starts a project in another department places the people invited there in that department.
- **New Task** sends invites through `POST /api/users/invite` with the task's department (`components/work/new-work-sheet.tsx:117-119`), so the placement check does run there.
- A project lead must be ACTIVE (`app/api/projects/route.ts:77-81`); a task holder may be invited (PENDING) (`lib/work/assignment.ts:106-110`).

### 6. Cross-site requests, links and headers

- **No CSRF token or Origin check.** A search of `app/`, `lib/` and `middleware.ts` finds none. The cookie's `sameSite: "lax"` (`lib/auth.ts:80`) is the only thing that stops cross-site writes.
- **No security headers on pages.** `next.config.mjs:1-28` has only redirects and a webpack alias, `vercel.json:1-12` has only crons, and `middleware.ts` sets none. Pages have no CSP, frame-ancestors or X-Frame-Options, HSTS or Referrer-Policy. The only CSP is on uploads served as downloads (`app/api/uploads/[name]/route.ts:40`).
- **GETs that change things.** Lax cookies go with top-level cross-site GETs, and mail scanners follow links. `/r/<token>` writes the reply and bells the organiser while the page renders (`app/r/[token]/page.tsx:16-43`), so a scanner opening the Can't link records NO; the token is not tied to a session and lasts 7 days (`lib/meeting-reply.ts:13`). `/api/whatsapp/test?send=1` sends a WhatsApp on GET (`app/api/whatsapp/test/route.ts:17`, `:28-38`).
- **Reply tokens use the session key.** Both are HS256 with `AUTH_SECRET` (`lib/meeting-reply.ts:15-21`; `lib/auth.ts:26-32`). They are kept apart only by the `purpose` claim (`lib/meeting-reply.ts:36`) and by `readSessionToken` requiring a known role (`lib/auth.ts:63-65`).
- **Tokens in URLs.** Invite and reply tokens travel in the URL path (`app/api/invite/[token]/validate/route.ts:17-18`; `app/r/[token]/page.tsx:16-17`), so they land in request logs and browser history. Hashing protects only the stored invite copy (`lib/invite.ts:26-28`).

## Trace 1 — assign a task

Setting: someone on a task record presses **Assigned to** and picks a person.

1. **Control.** The "Assigned to" button is disabled unless `access.canAssign` (`components/work/work-record.tsx:275`). `access` comes from the record read (`:75`). The button opens `AssignSheet` (`:396`).
2. **Picker** (`components/work/work-sheets.tsx:26-110`). With a team chosen it lists the team's members (`:50`); on a project, the project's people (`:51`); otherwise the people list, which leads and above receive (`:41`, `:53-55`), with invited people shown as "(invited)", and without that list only "me" (`:56`). A tap sends `{ assignmentGroupId: groupId, assigneeId }` and closes the sheet at once (`:80-83`); the team is always re-sent with it. "No one" sends `assigneeId: null` (`:96-98`).
3. **Hook.** `assign.mutate(input, { onError: fail })` (`components/work/work-record.tsx:396`). `useWorkMutations().assign` POSTs to `/api/tasks/:id/assign` (`lib/hooks/use-work.ts:105-108`) through `apiPost` (`lib/api.ts:35-36`, `:10-31`). An error shows as a toast (`components/work/work-record.tsx:105`).
4. **Middleware** verifies the token (`middleware.ts:20`). No token → 401 (`:74-76`). PERSON → 403 (`:27-29`).
5. **Route.** `POST` handler (`app/api/tasks/[id]/assign/route.ts:13-18`) inside `route()` (`lib/session.ts:114-124`; `:120-130` in the uncommitted working tree). `requireUser` loads the row and checks disabled and sessionVersion (`:14`, `lib/session.ts:24-35`, `:45-51`).
6. **parseBody** with `assignSchema` (`:15`, `lib/validation.ts:359-374`, `:387-393`). A bad body → 400 with issues.
7. **updateWork** (`:17`, `lib/work/tasks.ts:405`).
8. **loadScope** (`lib/work/tasks.ts:406`, `lib/work/access.ts:53-76`). ADMIN or PERSON → 403 (`:54-56`). CEO → everything (`:58-59`). Anyone else gets their own and headed departments (`:62-63`, `:68-71`), team memberships and led teams (`:64-65`, `:72-74`), and visible projects (`:66`, `lib/project-visibility.ts:20-52`).
9. **loadAccessRow** (`lib/work/tasks.ts:407-409`, `lib/work/access.ts:79-85`). A step is judged by its root task.
10. **canSeeTask** (`lib/work/tasks.ts:410`, `lib/work/access.ts:104-111`). Sight comes from: owner-only if private; the CEO; holder, requester or giver (`:87-89`); its team; its department in scope; its project visible. Otherwise → 404 "Task not found" (`:228-230`). A deleted task → 409 (`lib/work/tasks.ts:423`).
11. **canAssignTask** (`lib/work/tasks.ts:426-429`, `lib/work/access.ts:147-156`). A private task: never. Always allowed: the CEO, the head of its department, the lead or members of its team, its holder or giver. On a project: a lead or above who can see the project, or anyone on the project (`lib/project-people.ts:74-82`). Standalone: a lead or above in its department. Otherwise → 403 "You can't change who holds this."
12. **Team** (`lib/work/tasks.ts:471-480`). Private → 400. The team must exist (`:475-476`). A task with no department takes the team's (`:477`). Nothing checks the team's department: any team in the company is accepted, on a project task too (`:474-478`).
13. **Holder** (`lib/work/tasks.ts:481-485`). Private → 400. A step → 400.
14. **assertAssigneeAllowed**, run only when the holder changes (`lib/work/tasks.ts:487-489`, `lib/work/assignment.ts:93-132`).
    - The person must exist, not be disabled, and not be PERSON or ADMIN. Invited is fine (`:102-110`).
    - With a team: they must lead it or be on it, and the check ends there with `addToProject: false`, so the project branch below never runs (`:111-121`).
    - On a project: they are on it (`:123`), or the actor is lead-or-above, the CEO or the department head, and the person joins after the save (`:124-126`). Otherwise 400 (`:127`).
    - Standalone: yourself, or the actor is the CEO or lead-or-above (`:130`). Otherwise 400 (`:131`).
    - If the holder is the same but the new team does not include them, the task goes to the team unheld (`lib/work/tasks.ts:490-497`).
    - **Tester note:** the Team list offers every team in the company (`app/api/assignment-groups/route.ts:12-18`; `components/work/work-sheets.tsx:62-71`) and re-sends the team with every pick (`:81`). So anyone who may assign a project task can hand it to any member of any team; that person is not a project member and is not added as one.
15. **Fields** (`lib/work/tasks.ts:498-502`). `assigneeId`; `assignedAt` stamped or cleared; `givenById` = the actor for a new holder.
16. **stateAfterAssignment**, on root tasks only (`lib/work/tasks.ts:503-506`, `lib/work/workflow.ts:95-99`): NEW or ASSIGNED with a holder → IN_PROGRESS; ASSIGNED or IN_PROGRESS with no holder → NEW; anything else stays. `status` follows via `statusOf` (`lib/work/workflow.ts:33-47`; rules under Data and invariants).
17. **Transaction** (`lib/work/tasks.ts:531-548`). `task.update` (`:532`). Steps take the team and department (`:539-541`). Project membership is added when step 14 said so (`:542-544`). `recordChanges` writes one PUBLIC `FIELD_CHANGE` row per changed field, with old and new names (`:546`, `lib/work/activity.ts:134-163`). A refusal before this point writes nothing; a throw inside rolls it all back.
18. **Event** (`lib/work/tasks.ts:550-558`). The task is read again (`:551`). Type: `TASK_UNASSIGNED` if nobody holds it, `TASK_REASSIGNED` if someone did before, else `TASK_ASSIGNED` (`:555`). Skipped for an untitled task unless unassigned (`:556`). `emit` never throws (`lib/work/events.ts:82-88`). Only two events can go out: this one and, if the priority changed, `PRIORITY_CHANGED` (`lib/work/tasks.ts:553-558`, `:560-561`). The NEW → IN_PROGRESS change from step 16 is written as a `FIELD_CHANGE` (`:546`) but never emitted, so the requester never gets the "started" line (`lib/work/events.ts:215-217`) when an assignment starts the work.
19. **Routing** (`lib/work/events.ts:117-138`). Assigned or reassigned: the new holder gets the `task_given` message, unless they assigned it to themselves (`:120-125`, `lib/messages.ts:38-66`), and the previous holder gets a bell "… is no longer yours" (`:126-129`). Unassigned: a bell to the previous holder (`:132-138`).
20. **Delivery** (`lib/notify.ts:83-141`; the switches are in Architecture §9).
    - **Recipients:** not disabled, not PERSON (`:86-89`).
    - **Bell:** one Notification row, deduped on `task_given:<taskId>:<activityId>:<userId>` (`:100-108`, `:42-69`). An invited person gets the bell only (`:91-95`).
    - **Push:** to fresh ACTIVE recipients, fire-and-forget (`:109-110`). Needs VAPID keys (`lib/push.ts:52`). Dead subscriptions (404/410) are deleted (`lib/push.ts:68-70`).
    - **Email:** ACTIVE people with `emailOptIn`, awaited, errors logged (`lib/notify.ts:112-131`). `sendEmail` skips when SMTP is not set (`lib/email.ts:74`), for unreachable domains (`:77`), and for non-allowlisted addresses in development (`:88`). It reserves the dedupe key first (`:100`) and releases it on failure (`:119`).
    - **WhatsApp:** only when Twilio is set (`lib/notify.ts:133-139`), and only to people with a phone and `whatsappOptIn` (`lib/whatsapp.ts:215`). Deduped in `whatsAppLog`, released on failure (`:165-176`).
21. **Project reviews** re-sync for a project task (`lib/work/tasks.ts:570-572`). Never fatal (`:679-685`).
22. **DTO back** (`lib/work/tasks.ts:573`, `app/api/tasks/[id]/assign/route.ts:18`). `serializeTask` has names only, `alsoWith: []` (`lib/serialize.ts:104`), `nextMeeting: null` (`:123`), and no `access`.
23. **What the screen shows.** The hook does not use the returned row; it refreshes work, tasks, today, dashboard, notifications and the task's activity (`lib/hooks/use-work.ts:92-100`).
    - **Work list:** re-reads `GET /api/work?rows=tasks` (`components/work/work-page.tsx:208-228`, `app/api/work/route.ts:20-27`). `listWorkTasks` (`lib/work/query.ts:228-264`) filters with `filterWhere` (`:73-133`), which uses the visibility WHERE (`:18-30`) and shows open work by default (`:75-76`). `present` adds `alsoWith` and the next meeting (`:179-208`).
    - **The row** shows the state label (`components/work/task-table.tsx:143`), "Assigned by" (`:145`), the holder with "+N" when the task went to several people (`:146-160`), and the assigned date (`:162`).
    - **The record** re-reads `GET /api/work/:number` with `alsoWith` and `access` (`lib/hooks/use-work.ts:48-54`, `app/api/work/[number]/route.ts:13-38`). The giver keeps sight of the task, because a giver counts as "on it" (`lib/work/access.ts:87-89`, `:107`).
    - **Tester note:** holding one live task puts a person on the whole project. `visibleProjectIds` adds every project where they hold a task (`lib/project-visibility.ts:39-43`, `:50`), and `isOnProject` counts a holder (`lib/project-people.ts:78`, `:81`). That lets them edit (`lib/work/access.ts:140`), assign (`:153`) and move (`:184`, `:191`, `:194`) any task on the project, read its team notes (`:124`), and open its notes and files (`lib/comments.ts:12-19`; `lib/file-access.ts:39-42`). Removing their project membership does not undo this while they still hold the task (`app/api/projects/[id]/members/route.ts:135-139`). With the team case in step 14, this widens sight.

**Expected refusals (tester):**

| Case | Response |
|---|---|
| Signed out | 401 |
| PERSON | 403 |
| ADMIN | 403 "Not available for this account." |
| Cannot see the task | 404 |
| Deleted task | 409 |
| May see but not assign | 403 |
| Disabled, PERSON or ADMIN as holder | 400 "Pick someone who is on Orbit." |
| Holder not on the chosen team | 400 |
| Team member naming someone off the project | 400 |
| Team member giving a standalone task to someone else | 400 |
| Holder on the chosen team but not on the project | accepted, no refusal (`lib/work/assignment.ts:111-121`) |

## Trace 2 — open a file

Setting: a person taps a file on a note in a task's activity stream.

1. **Tile** (`components/notes/note-files.tsx:31-79`). A picture shows as a thumbnail whose `<img src>` is the file address (`:52-64`), so the thumbnail itself is a request to the same route and passes the same check. A picture that fails to load turns into a chip (`:45`, `:62`). A tap calls `onOpen` (`:48-51`). The same tile appears in the task stream (`components/work/activity-stream.tsx:239`), project and milestone threads (`components/notes/notes-thread.tsx:291`), and note bubbles (`components/project/note-bubble.tsx:41`). The list is already filtered: team notes reach only staff (`app/api/tasks/[id]/activity/route.ts:20-24`, `lib/work/activity.ts:220`).
2. **Viewer** (`components/work/work-record.tsx:92`, `:380`, `:401` → `components/work/attachment-viewer.tsx:26-104`). A file known only by its address is fetched once to read its name and type from the headers (`:111-140`). `FilePreview` (`:142-184`) draws only files served by Orbit or its Blob store (`:144`, `lib/file-kinds.ts:36-38`). The kind comes from the type and name (`lib/file-kinds.ts:10-25`). A Download link is always shown (`attachment-viewer.tsx:91`).
3. **Request** `GET /api/uploads/<id>` with the cookie. Middleware verifies the token (`middleware.ts:20`). No valid token → `401 {"error":"Unauthorized"}` (`:74-76`). PERSON → 403 (`:27-29`).
4. **requireUser** (`app/api/uploads/[name]/route.ts:23`, inside `route()`). A disabled account, a changed sessionVersion or no cookie → 401. PERSON → 403 (`lib/session.ts:27-32`, `:47-49`).
5. **Stored file read** (`app/api/uploads/[name]/route.ts:24-30`). `readStoredUpload` accepts only ids shaped `c` + 20–40 lowercase letters or digits, and loads name, type, bytes and uploader (`lib/uploads.ts:107-110`). Otherwise, in development only, a file from `.localdb/uploads` (`lib/uploads.ts:175-186`). The bytes are read before the access check; a missing file and a refused file get the same 404 (`route.ts:31-33`).
6. **canOpenFile** (`lib/file-access.ts:25-58`), for address `/api/uploads/<id>`. It opens if any branch passes:
   - **a. Uploader** → open (`:26`).
   - **b. Places holding the address**, at most 25 per source (`:27-37`): note files (`CommentAttachment`, tied to a comment or a task note), a comment's own first file, a task note's own file, a project logo, a task's result.
   - **c. Project, milestone or task comment** → open if `assertCanSeeTarget` passes (`:39-42`, `lib/comments.ts:11-23`). A project checks project sight; a milestone checks its project; a task uses `canAccessTask`, which refuses a task in no project (`lib/project-visibility.ts:64-71`).
   - **d. Task note** → open if `requireSee` passes (`lib/work/tasks.ts:71-76`) and the note is PUBLIC, or the viewer is staff on the task (`:43-50`, `lib/work/access.ts:119-126`). A team note's file opens only for staff.
   - **e. Project logo** → open if the viewer can see the project (`:51-53`).
   - **f. Task result** → open if `requireSee` passes (`:54-56`).
   - **g. Nothing passed** → closed (`:57`). A check that throws counts as "no" (`:17-23`), so an ADMIN, whom `loadScope` and `visibleProjectIds` refuse, opens only files they uploaded.
   - **Tester note:** `requireSee` does not refuse a deleted task (`lib/work/tasks.ts:71-76`, `lib/work/access.ts:79-85`). A result or task-note file on a deleted task still opens for anyone who could see that task.
7. **How it is served** (`app/api/uploads/[name]/route.ts:34-43`, `servedAs` `lib/uploads.ts:123-127`):

   | Stored type | Content-Type | Disposition | Extra header |
   |---|---|---|---|
   | PNG, JPEG, GIF, WebP, HEIC, AVIF, PDF, any audio, any video, text/plain (`lib/uploads.ts:113-115`) | as stored | inline | — |
   | SVG | image/svg+xml | attachment | `content-security-policy: sandbox; default-src 'none'` |
   | anything else (HTML, Markdown, CSV, Office files…) | application/octet-stream | attachment | `content-security-policy: sandbox; default-src 'none'` (`:40`) |

   Every response also carries `x-content-type-options: nosniff` (`:39`), an RFC 5987 file name (`:12`, `:38`), and `cache-control: private, max-age=31536000, immutable` (`:41`); step 9 says what that cache means for withdrawn access. The stored type is what the uploader's browser sent, or a guess from the name (`app/api/uploads/route.ts:25`, `lib/uploads.ts:188-222`), so a web page uploaded as `text/html` downloads sandboxed. **Blob:** when Blob storage is set, the note holds a Blob URL (`lib/uploads.ts:81-96`), fetched straight from Vercel Blob; it never passes through this route or `canOpenFile`.
8. **Preview.** Every preview fetches the same address with the cookie; a fetch ignores Content-Disposition.
   - **Picture:** `<img>` (`components/work/attachment-viewer.tsx:146-154`).
   - **PDF:** pdf.js with `isEvalSupported: false` (`components/work/previews/pdf-preview.tsx:26-30`), drawn to canvas, first 60 pages (`:8`, `:39-56`). If pdf.js fails, an `<iframe>` of the address (`:57-58`, `:67`).
   - **Word .docx:** `docx-preview` `renderAsync` with `renderAltChunks: false` (`components/work/previews/docx-preview.tsx:21-27`). http(s) and mailto links keep their href and open in a new tab with `noopener noreferrer` (`:30-32`). `#` anchors keep theirs, without target or rel (`:33`). Every other link loses its href (`:33-35`).
   - **Excel .xlsx:** `read-excel-file/browser` into tables, one tab per sheet (`components/work/previews/sheet-preview.tsx:22-25`, `:38-57`).
   - **Text, Markdown, CSV:** read as text, first 1,000,000 characters (`components/work/previews/text-preview.tsx:11`, `:59-75`). CSV is parsed in the page (`:14-52`, `:79`). Markdown goes through `react-markdown` + `remark-gfm`, with links opening in a new tab (`:80-96`). Plain text shows in a `<pre>` (`:98`).
   - **Video and audio:** native elements (`attachment-viewer.tsx:157-168`).
   - **Slides, older Office files, anything else:** download card (`:177-182`, `components/work/previews/download-card.tsx:21-37`).
9. **Someone without access** gets `404 {"error":"Not found"}` (`app/api/uploads/[name]/route.ts:31-33`), the same as a file that does not exist. That holds only for a browser that never fetched the file: every file response carries `cache-control: private, max-age=31536000, immutable` (`app/api/uploads/[name]/route.ts:41`), so a file someone has opened keeps loading from their browser cache for up to a year after the note is deleted and its bytes released (`app/api/comments/[id]/route.ts:22`, `:29`), after they lose sight of the project, or after their account is disabled. On screen:

   | Where | What they see |
   |---|---|
   | Thumbnail | turns into a chip (`note-files.tsx:45`, `:62`) |
   | Picture | "This picture can't be shown in this browser." (`attachment-viewer.tsx:147-148`) |
   | PDF | the fallback iframe loads the JSON error (`pdf-preview.tsx:29`, `:57-58`, `:67`) |
   | Word | "This document couldn't be shown here." (`docx-preview.tsx:22`, `:47`) |
   | Sheet | "This spreadsheet couldn't be shown here." (`sheet-preview.tsx:23`, `:35`) |
   | Text | "This file couldn't be read here." (`text-preview.tsx:63`, `:77`) |

10. **A signed-out request** gets `401 {"error":"Unauthorized"}` from the middleware (`middleware.ts:74-76`). The viewer uses plain `fetch`, so there is no redirect to `/login`. One exception, in development only: a disk file whose name ends in an image extension skips the middleware (`middleware.ts:86`) and gets its 401 from `requireUser` instead (`lib/session.ts:27`).
