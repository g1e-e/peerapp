# Peer Review App

A static peer review form. GitHub Pages serves this folder directly from `main` — there is no build step.

Opening `index.html` as a file shows the layout, but most browsers block the JavaScript modules, so the questions stay blank. Serve the folder instead:

```
python3 -m http.server
```

Then open `http://localhost:8000`. The published GitHub Pages site loads the form the same way.

The page is split in two. The left side is the questionnaire. The right side shows a reference PDF: drop a `.pdf` file on the panel, or use **Choose PDF**. The file stays in this browser and is not uploaded. **Replace** and **Remove** sit above the document. A reload clears the PDF. On a phone the two panels stack, with the questionnaire on top. Each panel scrolls on its own.

Answers are saved in the browser (`localStorage`) as you type and restored on reload. **Submit** shows a summary you can copy and, once Google Drive is set up, saves a copy there. **Clear** erases the answers in this browser. It does not delete Drive files.

## File layout

- `index.html` — page shell: questionnaire on the left, reference PDF panel on the right
- `admin.html` — password-protected list of Drive submissions
- `src/questions.js` — the four fixed sections, plus the incident template
- `src/app.js` — draws the form, saves answers in the browser, and submits to Drive
- `src/admin.js` — the admin page (reviews and submissions)
- `src/prep.js` — the screen where a review is prepared
- `src/config.js` — the Apps Script web app URL and the public review-link prefix
- `src/drive.js` — sends requests to the web app
- `src/pdfjs.js` — loads PDF.js from jsDelivr (version 6.4.299)
- `src/style.css` — layout and styling
- `apps-script/Code.gs` — the script to deploy from your Google account. GitHub Pages does not run it
- `package.json` and `src/index.js` — leftover Node starter files. The website does not use them

## How to edit questions

Open `src/questions.js`. The four sections that are always shown are the `segments` list. Each segment has a `title` and a `questions` list.

Incident questions live once, in `incidentTemplate`. A review chooses how many copies to show (0 to 10). On the plain page, with no review link, use **Add incident** and **Remove incident**. Each copy is titled Peer Review - Incident 1, 2, and so on. Ids look like `incident1.patientName`, so the copies stay separate.

Each question needs:

- `id` — a unique name. Answers are saved under this id, so do not reuse one. Incident copies add the number for you (`incident1.patientName`)
- `label` — the text shown on the form
- `type` — one of `text`, `textarea`, `date`, `select`, `rating`, `yesNoNa`, or `radio`

For a dropdown, set `type` to `"select"` and add `options`, for example `["Open", "In Progress", "Completed"]`.

A `rating` question is 1 to 5. Set `min` and `max` on that question for a different scale.

A `yesNoNa` question shows Yes, No, and N/A as radio buttons on one row. A `radio` question is the same row with your own `options`, for example `["Difficult", "Average"]`. Set `number` to show that number in front of the label.

A `textarea` starts at 4 rows. Set `rows` to make it taller.

Set `width` to `"half"` to place a short field beside the next half-width field when the section is wide. Leave it off for a full-width field. A narrow section stacks every field in one column.

You can add a `placeholder` string for hint text inside a text field, and a `note` string on a segment for a short line under its title.

Save the file and refresh the page. Answers already saved in the browser stay put unless you click Clear or change a question's `id`.

## Google Drive setup

Submissions are saved by a Google Apps Script web app in your Google account. The website itself stays a static page.

1. Open [script.google.com](https://script.google.com) and choose **New project**.
2. Replace the default script with the contents of `apps-script/Code.gs`.
3. Open **Project Settings**. Under **Script properties**, add a property named `ADMIN_PASSWORD`. Set the value to the admin password. The current 4-digit password keeps working. Before real reviews, change it to a longer password. Do not put that password in this repo. Turn on 2-step verification for the Google account that owns the script.
4. Choose **Deploy > New deployment**. Pick **Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Deploy, then authorize the app.
5. Copy the web app URL (it ends in `/exec`) into `src/config.js` as `APPS_SCRIPT_URL`.

The script keeps a `peerapp index.json` file in `peerapp submissions` so the admin page can list reviews and submissions without opening every file. The index file id is stored in script properties, and the index and each review stay in Apps Script cache for six hours. The latest 150 submissions are stored in that index, answers included, so opening one does not read Drive again. Each review PDF is stored as separate chunk files in its own folder under `peerapp reviews`. Drive files stay private to your account.

`Code.gs` changed again for faster admin saves and for the six-hour cache. Paste the new file over the script, then redeploy with **Deploy > Manage deployments > edit (pencil) > New version**. That keeps the same `/exec` URL already in `src/config.js`. Leave `ADMIN_PASSWORD` as it is. Reviews saved before the chunked-PDF change need to be created again; opening one shows "This review needs to be re-saved". Older reviews with no access-code field stay open and usable with the link alone.

Until `APPS_SCRIPT_URL` is filled in, Submit still shows the on-page summary and says Drive is not set up, and the admin page says it is not configured.

## Preparing a review

1. Open the **Admin** link, enter the password, and stay on **Reviews**.
2. Choose **New review** and give it a name. Set an **Access code** next to the name, or click **Generate** for a 12-character code such as `K7QM-W2XR-9DPA`. Leave it empty only if you accept the warning that the link alone opens the PDF. **Close review** stops subject access until you **Reopen review**.
3. Set **Number of incidents** (0 to 10). The page shows that many Peer Review - Incident sections. Lowering the number drops page assignments for the incidents you remove, and asks first if any were set.
4. Drop in the reference PDF, or choose a file. It can be large, but it must be under about 45 MB. A trimmed PDF of about 8 MB or smaller is sent with Save review in one request. Larger files still upload in pieces.
5. The editor matches the subject screen: questions on the left, pages on the right. Click a question, then click thumbnails. Shift-click selects a range. **Contents** jumps using the PDF bookmarks when the file has them. **Show selected only** shows the same scrolling pages the subject will see. Chart Review question 3 tries to read procedure start and end times from the selected pages; you can type over them.
6. Choose **Save review**. Copy the subject link. It looks like `https://g1e-e.github.io/peerapp/?review=` followed by a long id. If the review has an access code, copy that too and send it separately from the link. The subject enters the code before the review name or PDF loads. The code is not put in the link.
7. **Open** edits a review later. **Submissions** lists the answers, and **Show** can limit the list to one review.

Someone who opens the site without `?review=` can still drop a PDF locally. Subjects should use the link they were sent. Their answers are stored in the browser separately for each review. A subject access code stays in that tab only (`sessionStorage`). The admin password is exchanged for a session token that also stays in that tab and expires after two hours away.

## Privacy

Protected:

- An access code, when set, is checked on the server before the review name, PDF pages, or a submission. A wrong code and a missing review return the same message. Five failures in 15 minutes lock that review for 15 minutes, and 50 failures in an hour lock code entry for 15 minutes.
- The code is stored only in the private review file in your Drive. The admin page can show it after unlock. Subjects never receive it from the server.
- Subject PDF bytes stay in memory for that tab. They are not written to `localStorage`, IndexedDB, or the Cache API.
- Unlock trades the admin password for a random session token kept for two hours in Apps Script cache. Lock deletes that token. The browser does not keep the password.
- The script does not grant Drive viewers or editors and does not return download links or Drive file ids to subjects. Files it creates are left unshared. At most once every six hours it checks that the submissions, reviews, and tmp folders are private, and makes them private if they are not.
- **Close review** refuses every subject request with "This review is closed." Deleting a review moves its PDF folder and its submissions folder to the Drive trash.
- `index.html` and `admin.html` send no referrer and ask crawlers not to index the pages.

Keep private yourself:

- The Google account that owns the script. Turn on 2-step verification.
- The admin password. A 4-digit password still unlocks. Use a longer one before real reviews.
- Any review link that has no access code. Anyone with that link can see the PDF pages. The reviews list marks those as **No access code**.
