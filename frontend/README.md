# MethodMark frontend

React 19, TypeScript, Vite, and Lucide icons. This directory contains the public landing page, tutor authentication, responsive tutor dashboard, and account-free student assignments.

## Development

From `frontend/`:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. To use **Generate sample paper**, also run the backend:

```sh
cd ../backend
uv sync --locked
uv run python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Set `METHODMARK_SUPABASE_URL` and `METHODMARK_SUPABASE_SECRET_KEY` in `backend/.env` first. The sample-paper flow sends the signed-in tutor access token to the backend API. Keep the secret key in the backend only. The backend verifies the Supabase Auth user. This all-status sample endpoint remains available only with `METHODMARK_ENVIRONMENT=development`. Classes, saved papers, assignments and submissions use real Supabase data; analytics and AI-marking screens remain demos.

Vite forwards `/api/*` requests to http://127.0.0.1:8000. To override the development target, copy `.env.example` to `.env` and set `API_PROXY_TARGET`. Keep browser calls relative, such as `fetch('/api/v1/health')`. Do not put secrets in `VITE_*` variables; those are included in client bundles.

## Landing page and tutor accounts

- `/`: landing page when signed out; workspace when signed in.
- `/?view=login`, `/?view=signup`: email/password popups over the landing page.
- `/?view=forgot-password`, `/?view=reset-password`: recovery request and new password form.
- `/?view=workspace`: requires a verified tutor session.
- `/?assignment=<share-token>`: account-free student paper, independent of tutor authentication.

Set these **public** values in `frontend/.env.local` (already present in this workspace):

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Restart Vite after changing environment values. Never use a secret or service-role key in the frontend. Supabase Auth handles password hashing, verification emails, recovery tokens, persistence and token refresh. The app requires at least 8 characters for new passwords; configure the same or a stronger password policy in Supabase. Tutor IDs reference `auth.users.id`; no separate tutors table or signup trigger is needed.

In Supabase **Authentication > URL Configuration**, set the Site URL to the frontend origin and allow these redirect URLs for each origin you use:

```text
http://localhost:5173/?view=login
http://localhost:5173/?view=reset-password
http://127.0.0.1:5173/?view=login
http://127.0.0.1:5173/?view=reset-password
```

Add equivalent HTTPS URLs for deployment. Keep email/password login enabled. Registration supports both email confirmation enabled and disabled. Configure SMTP for delivery to real tutor addresses; the default Supabase email service is intended for limited testing. Provider email delivery and hosted dashboard settings are not exercised by browser tests.

The account flows implement Use Cases 1-4 from `docs/Use_Case_Model.doc`. Registration returns to login with confirmation guidance, login verifies stored sessions before opening the workspace, recovery uses Supabase's single-use email links, and logout clears the local session even if server confirmation fails. Supabase revokes the refresh token on logout; an issued access JWT can remain valid until its expiry. Backend verification and the existing RLS policies remain necessary for protected data.

`AppRoot.tsx` selects public, authenticated and student entry points. `LandingPage.tsx` owns the marketing page, `AuthDialog.tsx` the account popup and forms, and `lib/supabase.ts` / `useTutorAuth.ts` the SDK and session handling. Tutor and student screens load separately from the public page. Login, signup and recovery switch within a native modal dialog without reloading the landing page. The popup supports Escape, backdrop dismissal, keyboard focus containment and short-screen scrolling; existing account URLs and browser history still work. No router, form library, social login, payment flow or student registration is added.

Authentication, classes, papers, assignments and submissions are connected to Supabase. AI marking remains a prototype. No real accounts or emails are created by the automated tests: auth API responses are mocked while the real SDK and browser flows are exercised.

References: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [email delivery](https://supabase.com/docs/guides/auth/auth-smtp), and [sign out](https://supabase.com/docs/reference/javascript/auth-signout).

## Notifications

Use `useToast()` from `components/Toast.tsx` for `toast.success(message)`, `toast.error(message)` or `toast.info(message)`. The shared provider shows the latest notification at the top centre. Success and information notices time out; errors remain dismissible. Hover, keyboard focus and hidden tabs pause the timer. Dialogs include `ToastHost` to keep notifications accessible above their content.

`useRemoteData` reports request failures automatically. Use `useToastError(message)` for other persistent error state; it clears its notice when the error resolves. Field guidance, loading states and retry controls stay beside the relevant content.

## Build and check

```sh
npm run build
npm run preview
npm run test:e2e
```

Playwright uses an installed Google Chrome and starts Vite automatically if it is not already running. Checks cover navigation, paper creation/publishing, review validation, saved papers, submission tracking, filters, downloads, mobile layout, and student-code entry. Screenshots are written to `test-results/`.

The production output is `dist/`. Vite's `/api` development proxy is not part of that output: configure API routing in the deployment web server.

## Features and sample-data boundary

- Overview, practice papers, assignments, marking queue, classes/students, insights, and workspace preferences.
- Paper and rubric editing, assignment snapshots, review drafts, approval confirmation, and CSV exports.
- Student access with a class code, handwriting on the paper, local drafts, print/save PDF, and submitted handwriting/photos.

**Create practice paper** loads Supabase `questions` through `GET /api/v1/sample-paper/questions` when the builder opens. The form groups subject, school year and subject level in the first row; an optional topics multi-select dropdown, optional question count and duration in the second; and optional paper title beside a difficulty slider in the third. The slider selects Easy, Medium or Hard and defaults to Medium. Subjects, years, levels and topics come from the available bank data, with dependent choices reset when their parent changes. All available topics start checked, including after changing subject, year or level. The topics dropdown has Select all and Clear all actions; clearing all requires choosing a topic before generating. Generation filters the loaded bank by these choices; multiple topics match any selected topic, and difficulty matches the selected slider level. A blank count includes every match; a smaller count samples unique questions without splitting their parts. Invalid counts and no-match selections cannot generate a paper. Question status is not filtered in this sample flow. Each question retains shared text, parts, SVG diagrams, worked solutions and individual marking points. Totals are calculated from `max_marks`. Loading, empty-bank, failure/retry and cancellation states never substitute hardcoded questions.

Generated papers and edited snapshots are saved in Supabase `papers`. Published content is frozen; assignments reference that saved paper. The Assignments tab and each class roster share `AssignmentsPanel`, with real counts and filters for submitted/not-submitted students. Due dates use Singapore time; status becomes **Ready for grading** at the deadline and the server closes submissions.

The Practice papers tab shows the tutor's saved papers. Use **Create practice paper** to select questions from the question bank and save a new draft.

Profile preferences and demo review drafts still use user-scoped local storage. Old local paper/assignment previews are no longer read; they are not imported into another tutor's account. Historical analytics and the marking queue remain illustrative.

Fonts load from Google Fonts with system fallbacks. Question fetching, paper mapping and structured rendering live in `src/api/questions.ts`, `src/lib/paperQuestions.ts` and `src/components/QuestionContent.tsx`. Browser regression tests mock the backend using fixtures matching the first five questions in `supabase/seed_questions.sql`.

## Practice-paper preview

The preview follows the layout of the secondary mathematics paper in `docs/`: an A4 cover, student details, instructions, numbered questions, working space and dotted answer lines with bracketed marks. Complete questions are grouped into pages using their rendered heights. Tutor metadata remains available in the editor.

Tutor and student paper views share `PaperToolbar`: 56px high on desktop and 92px below 1000px, with 32px controls. Phone controls use labelled icons. The student toolbar remains sticky. The reusable `PaperActionBar` below the tutor paper matches these heights and shares the compact button component; save and publish labels remain visible on phones. All paper controls are hidden when printing.

**Show solutions & rubric** opens a separate marking guide with solutions and marking criteria in tables. **Print / Save PDF** prints the current view (question paper or marking guide), without the surrounding tutor controls. Question editing and review approval continue to work from the toolbar and footer.

Students render the same `ExamPaper` component from the saved snapshot. The backend returns only question content and mark totals, excluding solutions and rubric criteria. A `HandwritingArea` overlays each answer space. Paper layout and printed handwriting stay consistent with the tutor copy. The student link works in any browser that can reach the deployed frontend and backend; localhost links remain local to the developer's machine.


## Handwriting

Choose **Pen** to write with a stylus or mouse, **Eraser** to remove whole strokes, or **Scroll** to scroll and pinch-zoom. Scroll is the default. Writing accepts stylus or mouse input; finger touches do not create ink. Only the active pointer can alter a stroke; cancelled gestures are discarded. Hardware palm rejection depends on the device/browser.

`StudentPaper.tsx` owns the student controls and photo selection. `HandwritingArea.tsx` handles pointer input and renders SVG strokes with no drawing dependency. `useHandwriting.ts` handles undo/redo and local persistence. Points use coordinates relative to their answer space, keyed by question and part IDs, so pagination does not move answers between questions.

Handwriting saves after every completed stroke, erase, undo, or redo under `methodmark:handwriting:v1:<assignment>:<paper>:<student>`. Reopening the same assignment with the same code in the same browser restores the draft. Undo history is limited to 50 edits and lasts for the current session. Storage failures are shown explicitly and leave ink visible for printing. Photo files remain in memory only and need reattaching after refresh. **Submit work** sends ink and up to five JPG/PNG photos (10 MB each) to the backend. Photos are stored privately before a submission receipt is recorded. Retries reuse a submission ID; successful submissions become read-only. AI grading is not triggered.

Browser checks cover mouse and emulated pen/touch input, scrolling, per-part writing, erasing, undo/redo, draft restoration/isolation, storage failure, photo fallback, and unchanged tutor/student paper content and dimensions. Actual iPad/Apple Pencil hardware still needs a device check.


## Paper and class colours

New papers and classes receive a random colour from a shared
six-colour palette. Use **Colour** on a card, or inside a class, to change it.
Selections are stored in Supabase and do not alter question content or review status.

Open a paper and choose **Delete paper** in its top toolbar to remove it from the library after confirmation. Class and paper cards share `ItemCard` for their colour, icon and opening controls.
Deletion sets `papers.is_deleted`; existing assignments, student links and submissions
remain available. Deleted papers cannot be published to new classes.

For an existing database, run `supabase/update_papers_and_classes.sql` in the SQL
Editor. It adds the colour fields and library deletion flag, gives tutors permission
to change class colours, and updates the publishing function. It does not delete data.
Fresh databases use the updated `setup.sql`.

## Classes and students

This tab reads and writes Supabase with the signed-in tutor's session.
The updated `supabase/setup.sql` requires a fresh application schema. Keep Auth
users, remove the old application tables/view, then run the complete setup.
Run `seed_questions.sql` separately for 30 example questions.

Create a class, open it, then choose **Add students**. Every addition creates new
student records for that class, with colour-animal codes and optional names.
Enter a name and press **Save** whenever ready. There is no existing-student picker;
the same person in another class gets a separate record and independently saved
name. Codes are unique within a class. The roster has no sample-data fallback.

The trash icon removes a student from the roster and disables their code after
confirmation. Submitted work remains available. The code is not reassigned.
**Delete class** permanently removes that class's students, assignments and
submission records. Other classes and practice papers are preserved.
