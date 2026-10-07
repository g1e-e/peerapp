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
3. Open **Project Settings**. Under **Script properties**, add a property named `ADMIN_PASSWORD`. Set the value to the admin password. A 4-digit code is what the lockout is built for. Do not put that password in this repo.
4. Choose **Deploy > New deployment**. Pick **Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Deploy, then authorize the app.
5. Copy the web app URL (it ends in `/exec`) into `src/config.js` as `APPS_SCRIPT_URL`.

The script creates three Drive folders when they are first needed: `peerapp submissions` (answer files, with a subfolder per review), `peerapp reviews` (the review and its PDF), and `peerapp tmp` (upload pieces, removed after the PDF is assembled). Drive files stay private to your account. The site only sees them through the web app.

If you already deployed an older copy of `Code.gs`, replace the whole script with the file in this repo, then redeploy with **Deploy > Manage deployments > edit (pencil) > New version**. That keeps the same `/exec` URL. `ADMIN_PASSWORD` can stay as it is. You do not need to create the folders yourself.

Until `APPS_SCRIPT_URL` is filled in, Submit still shows the on-page summary and says Drive is not set up, and the admin page says it is not configured.

## Preparing a review

1. Open the **Admin** link, enter the password, and stay on **Reviews**.
2. Choose **New review** and give it a name.
3. Set **Number of incidents** (0 to 10). The page shows that many Peer Review - Incident sections. Lowering the number drops page assignments for the incidents you remove, and asks first if any were set.
4. Drop in the reference PDF, or choose a file. It can be large, but it must be under about 45 MB. The file uploads in pieces.
5. For any question, type the PDF pages to show, like `3-7, 12, 40-45`. A question can have up to 50 pages. Click the question to preview those pages.
6. Choose **Save review**. Copy the subject link. It looks like `https://g1e-e.github.io/peerapp/?review=` followed by a long id. That id is the only key the subject needs.
7. **Open** edits a review later. **Submissions** lists the answers, and **Show** can limit the list to one review.

Someone who opens the site without `?review=` can still drop a PDF locally. Subjects should use the link they were sent. Their answers are stored in the browser separately for each review.
