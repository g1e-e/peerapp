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
- `src/questions.js` — the form, as data. Edit this file to change sections and questions
- `src/app.js` — draws the form, saves answers in the browser, and submits to Drive
- `src/admin.js` — the submissions page
- `src/config.js` — the Apps Script web app URL
- `src/drive.js` — sends submit, list, and delete requests
- `src/style.css` — layout and styling
- `apps-script/Code.gs` — the script to deploy from your Google account. GitHub Pages does not run it
- `package.json` and `src/index.js` — leftover Node starter files. The website does not use them

## How to edit questions

Open `src/questions.js`. The form is the `segments` list. Each segment has a `title` and a `questions` list, and shows up as its own section.

Each question needs:

- `id` — a unique name. Answers are saved under this id, so do not reuse one (the two incident sections use ids like `incident1PatientName` and `incident2PatientName` so they stay separate)
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

The first submission creates a Drive folder named `peerapp submissions`. Each submit adds a JSON file there.

After you change `Code.gs`, redeploy with **Deploy > Manage deployments > edit (pencil) > New version**. That keeps the same URL. Then refresh the site. Until `APPS_SCRIPT_URL` is filled in, Submit still shows the on-page summary and says Drive is not set up, and the admin page says it is not configured.
