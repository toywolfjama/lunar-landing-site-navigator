import fs from "node:fs";
const js = fs.readFileSync("dist/main.js", "utf8").replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync("src/styles.css", "utf8");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lunar Landing Site Navigator</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>
${js}
</script>
</body>
</html>
`;
fs.writeFileSync("index.html", html);
console.log("index.html", (html.length / 1024).toFixed(0), "KB");
