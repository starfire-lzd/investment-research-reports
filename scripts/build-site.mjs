import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const reportNames = ["盘前分析.md", "盘中分析.md", "盘后复盘.md"];
const reportLabels = {
  "盘前分析.md": "盘前分析",
  "盘中分析.md": "盘中分析",
  "盘后复盘.md": "盘后复盘"
};

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value) {
  return encodeURIComponent(value.replace(/\.md$/, ""));
}

function inlineMarkdown(value) {
  let escaped = escapeHtml(value);
  escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = href.startsWith("http") ? href : "#";
    return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  return escaped;
}

function renderTable(lines) {
  const rows = lines
    .filter((line, index) => index !== 1)
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => inlineMarkdown(cell.trim())));
  const [head, ...body] = rows;
  return [
    "<div class=\"table-wrap\"><table>",
    "<thead><tr>",
    ...head.map((cell) => `<th>${cell}</th>`),
    "</tr></thead>",
    "<tbody>",
    ...body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`),
    "</tbody></table></div>"
  ].join("");
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = [];
  let table = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  function flushList() {
    if (list.length > 0) {
      html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  }

  function flushTable() {
    if (table.length > 0) {
      html.push(renderTable(table));
      table = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushParagraph();
      flushList();
      table.push(trimmed);
      continue;
    }

    flushTable();

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 4);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      list.push(ordered[1]);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushTable();
  return html.join("\n");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listReports() {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const dates = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const reports = [];
  for (const date of dates) {
    for (const fileName of reportNames) {
      const filePath = path.join(root, date, fileName);
      if (await exists(filePath)) {
        const markdown = await fs.readFile(filePath, "utf8");
        reports.push({
          date,
          fileName,
          label: reportLabels[fileName],
          markdown,
          url: `${date}/${slugify(fileName)}.html`
        });
      }
    }
  }
  return reports;
}

function pageShell({ title, body, active = "" }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${active ? "../" : ""}assets/site.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="${active ? "../" : ""}index.html">投研日报</a>
    <nav>
      <a href="${active ? "../" : ""}index.html">全部报告</a>
    </nav>
  </header>
  <main>${body}</main>
  <footer>仅供个人投研复盘使用，不构成投资建议。</footer>
</body>
</html>`;
}

function renderIndex(reports) {
  const grouped = new Map();
  for (const report of reports) {
    if (!grouped.has(report.date)) grouped.set(report.date, []);
    grouped.get(report.date).push(report);
  }

  const days = [...grouped.entries()]
    .map(([date, items]) => `<section class="day">
      <div class="day-head">
        <h2>${date}</h2>
        <span>${items.length} 篇</span>
      </div>
      <div class="report-grid">
        ${items.map((item) => `<a class="report-card" href="${item.url}">
          <span>${item.label}</span>
          <strong>${item.fileName.replace(".md", "")}</strong>
        </a>`).join("")}
      </div>
    </section>`)
    .join("\n");

  return pageShell({
    title: "投研日报",
    body: `<section class="hero">
      <p>每日 A 股投研记录</p>
      <h1>盘前、盘中、盘后复盘</h1>
      <div class="meta">${reports.length} 篇报告，${grouped.size} 个交易日</div>
    </section>
    ${days || "<p>暂无报告。</p>"}`
  });
}

function renderReport(report, nearby) {
  const body = `<article class="report">
    <div class="report-title">
      <p>${report.date}</p>
      <h1>${report.label}</h1>
    </div>
    <div class="switcher">
      ${nearby.map((item) => `<a class="${item.fileName === report.fileName ? "current" : ""}" href="${slugify(item.fileName)}.html">${item.label}</a>`).join("")}
    </div>
    <div class="content">${markdownToHtml(report.markdown)}</div>
  </article>`;
  return pageShell({ title: `${report.date} ${report.label}`, body, active: report.date });
}

async function main() {
  const reports = await listReports();
  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(path.join(dist, "assets"), { recursive: true });
  await fs.writeFile(path.join(dist, "index.html"), renderIndex(reports));
  await fs.writeFile(path.join(dist, "assets", "site.css"), await fs.readFile(path.join(root, "site", "site.css"), "utf8"));

  for (const report of reports) {
    const reportDir = path.join(dist, report.date);
    await fs.mkdir(reportDir, { recursive: true });
    const nearby = reports.filter((item) => item.date === report.date);
    await fs.writeFile(path.join(reportDir, `${slugify(report.fileName)}.html`), renderReport(report, nearby));
  }

  console.log(`Built ${reports.length} reports into ${dist}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

