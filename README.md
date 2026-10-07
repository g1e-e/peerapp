# Peer Review App

A static peer review form. GitHub Pages serves this folder directly from `main` — there is no build step.

Opening `index.html` as a file shows the layout, but most browsers block the JavaScript modules, so the questions stay blank. Serve the folder instead:

```
python3 -m http.server
```

Then open `http://localhost:8000`. The published GitHub Pages site loads the form the same way.

The page is split in two. The left side is the questionnaire. The right side shows a reference PDF: drop a `.pdf` file on the panel, or use **Choose PDF**. The file stays in this browser and is not uploaded. **Replace** and **Remove** sit above the document. A reload clears the PDF. On a phone the two panels stack, with the questionnaire on top. Each panel scrolls on its own.

Answers are saved in the browser (`localStorage`) as you type and restored on reload. **Submit** shows a summary you can copy. **Clear** erases the saved answers.

## File layout

- `index.html` — page shell: questionnaire on the left, reference PDF panel on the right
- `src/questions.js` — the form, as data. Edit this file to change sections and questions
- `src/app.js` — draws the form, saves answers, and builds the summary
- `src/style.css` — layout and styling
- `package.json` and `src/index.js` — leftover Node starter files. The website does not use them

## How to edit questions

Open `src/questions.js`. The form is the `segments` list. Each segment has a `title` and a `questions` list, and shows up as its own section.

Each question needs:

- `id` — a unique name. Answers are saved under this id, so do not reuse one (the two incident sections use ids like `incident1Date` and `incident2Date` so they stay separate)
- `label` — the text shown on the form
- `type` — one of `text`, `textarea`, `date`, `select`, `rating`, `yesNoNa`, or `radio`

For a dropdown, set `type` to `"select"` and add `options`, for example `["Open", "In Progress", "Completed"]`.

A `rating` question is 1 to 5. Set `min` and `max` on that question for a different scale.

A `yesNoNa` question shows Yes, No, and N/A as radio buttons on one row. A `radio` question is the same row with your own `options`, for example `["Difficult", "Average"]`. Set `number` to show that number in front of the label.

A `textarea` starts at 4 rows. Set `rows` to make it taller.

You can add a `placeholder` string for hint text inside a text field, and a `note` string on a segment for a short line under its title.

Save the file and refresh the page. Answers already saved in the browser stay put unless you click Clear or change a question's `id`.
