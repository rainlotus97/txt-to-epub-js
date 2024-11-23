document.getElementById("convert").addEventListener("click", async () => {
    const txtFileInput = document.getElementById("txtFile");
    const coverFileInput = document.getElementById("coverFile");
    const authorInput = document.getElementById("author");

    if (!txtFileInput.files.length) {
        alert("Please select a TXT file");
        return;
    }

    const txtFile = txtFileInput.files[0];
    const coverFile = coverFileInput.files.length ? coverFileInput.files[0] : null;
    const fileName = txtFile.name.replace(/\.txt$/, ".epub"); // Use file name for EPUB
    const txtContent = await txtFile.text();

    // Extract author if declared as "作者: xxx" or "作者：xxx"
    const authorMatch = txtContent.match(/作者[:：]\s*(.+)/);
    const author = authorMatch ? authorMatch[1].trim() : (authorInput.value || "Unknown");

    // Regular expression to detect chapters and volumes
    const chapterRegex = /(第[一二三四五六七八九十0-9]+[章卷][^\n]*|楔子|引言|序章[^\n]*)/g;

    const matches = txtContent.split(chapterRegex);
    const chapters = [];
    for (let i = 1; i < matches.length; i += 2) {
        const title = matches[i].trim(); // Full title (e.g., "第1章 天地初开")
        let content = matches[i + 1]?.trim() || ""; // Content following the title

        // Clean up content: remove extra spaces and newlines
        content = content
            .split(/\n+/) // Split by newlines
            .map(line => line.trim()) // Remove leading/trailing spaces
            .filter(line => line) // Remove empty lines
            .join("</p><p>"); // Join with <p> tags

        const isVolume = /第[一二三四五六七八九十0-9]+卷/.test(title); // Check if it's a volume
        const htmlTitle = isVolume
            ? `<h1>${title}</h1>`
            : `<h2>${title}</h2>`; // Use h1 for volumes, h2 for chapters

        chapters.push({
            title,
            content: `${htmlTitle}<p>${content}</p>` // Format title and content
        });
    }

    if (chapters.length === 0) {
        alert("No chapters detected. Ensure the text contains markers like '第1章 天地初开'.");
        return;
    }

    // Initialize JSZip
    const zip = new JSZip();

    // Add mimetype file
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    // Add META-INF/container.xml
    zip.folder("META-INF").file("container.xml", `
      <?xml version="1.0" encoding="UTF-8"?>
      <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
        <rootfiles>
          <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
        </rootfiles>
      </container>
    `.trim());

    // Add OEBPS/content.opf
    const manifest = chapters.map((_, index) => `
      <item id="chap${index + 1}" href="chapter${index + 1}.xhtml" media-type="application/xhtml+xml"/>
    `).join("\n");
    const spine = chapters.map((_, index) => `
      <itemref idref="chap${index + 1}"/>
    `).join("\n");

    // Add cover image to manifest if provided
    const coverManifest = coverFile ? `<item id="cover" href="cover.${coverFile.type.split("/")[1]}" media-type="${coverFile.type}"/>` : "";
    const metaCover = coverFile ? `<meta name="cover" content="cover"/>` : "";

    zip.folder("OEBPS").file("content.opf", `
      <?xml version="1.0" encoding="UTF-8"?>
      <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>${txtFile.name.replace(/\.txt$/, "")}</dc:title>
          <dc:language>zh</dc:language>
          <dc:creator>${author}</dc:creator>
          <dc:identifier id="book-id">123456789</dc:identifier>
          ${metaCover}
        </metadata>
        <manifest>
          ${manifest}
          ${coverManifest}
        </manifest>
        <spine>
          ${spine}
        </spine>
      </package>
    `.trim());

    // Add chapters as separate XHTML files with inline CSS for paragraph indentation
    const css = `
      body { font-family: Arial, sans-serif; line-height: 1.6; }
      p { text-indent: 2em; margin: 0; }
    `;

    zip.folder("OEBPS").file("style.css", css);

    chapters.forEach((chapter, index) => {
        zip.folder("OEBPS").file(`chapter${index + 1}.xhtml`, `
        <?xml version="1.0" encoding="UTF-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml" lang="zh">
          <head>
            <title>${chapter.title}</title>
            <link rel="stylesheet" type="text/css" href="style.css"/>
          </head>
          <body>${chapter.content}</body>
        </html>
      `.trim());
    });

    // Add cover image if provided
    if (coverFile) {
        const coverData = await coverFile.arrayBuffer();
        const coverExtension = coverFile.type.split("/")[1]; // Get file extension (e.g., 'jpg')
        zip.folder("OEBPS").file(`cover.${coverExtension}`, coverData);
    }

    // Generate EPUB
    const blob = await zip.generateAsync({ type: "blob" });
    const epubUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = epubUrl;
    a.download = fileName; // Use the original file name
    a.textContent = "Download EPUB";
    document.body.appendChild(a);
});
