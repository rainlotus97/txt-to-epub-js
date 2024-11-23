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
    const coverExtension = coverFile.type.split("/")[1];  // Get file extension (e.g., 'jpg')
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

    const navPoints = chapters.map(
        (chapter, index) => `
      <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
        <navLabel>
          <text>${chapter.title}</text>
        </navLabel>
        <content src="chapter${index + 1}.xhtml" />
      </navPoint>
    `).join("\n");

    zip.folder("OEBPS").file("toc.ncx", `
    <?xml version="1.0" encoding="UTF-8"?>
    <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
      <head>
        <meta name="dtb:uid" content="book-id" />
        <meta name="dtb:depth" content="1" />
        <meta name="dtb:totalPageCount" content="0" />
        <meta name="dtb:maxPageNumber" content="0" />
      </head>
      <docTitle>
        <text>${txtFile.name.replace(/\.txt$/, "")}</text>
      </docTitle>
      <docAuthor>
        <text>${author}</text>
      </docAuthor>
      <navMap>
        ${navPoints}
      </navMap>
    </ncx>
    `.trim());

    // Add OEBPS/content.opf
    const manifest = chapters.map((_, index) => `
      <item id="chap${index + 1}" href="chapter${index + 1}.xhtml" media-type="application/xhtml+xml"/>
    `).join("\n");
    let spine = chapters.map((_, index) => `
      <itemref idref="chap${index + 1}"/>
    `).join("\n");

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

    const coverFilename = `cover.${coverExtension}`;
    let coverManifest = coverFile ? `<item id="cover" href="${coverFilename}" media-type="${coverFile.type}"/>` : "";
    // Add cover image if provided
    if (coverFile) {
        const coverData = await coverFile.arrayBuffer();

        zip.folder("OEBPS").file(coverFilename, coverData);

        // 添加封面页面
        zip.folder("OEBPS").file(
            "cover.xhtml",
            `
          <?xml version="1.0" encoding="UTF-8"?>
          <html xmlns="http://www.w3.org/1999/xhtml" lang="zh">
            <head><title>Cover</title></head>
            <body>
              <div style="text-align: center;">
                <img src="${coverFilename}" alt="Cover" />
              </div>
            </body>
          </html>
          `.trim()
        );

        // 在 manifest 中声明封面
        coverManifest = `
          ${coverManifest}
          <item id="coverPage" href="cover.xhtml" media-type="application/xhtml+xml"/>
        `;

        // 在 spine 中添加封面页面
        spine = `
          <itemref idref="coverPage" linear="yes"/>
          ${spine}
        `;
    }

    // Add cover image to manifest if provided
    const metaCover = coverFile ? `<meta name="cover" content="cover"/>` : "";
    const tocManifest = `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`;

    zip.folder("OEBPS").file("content.opf", `
      <?xml version="1.0" encoding="UTF-8"?>
      <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="2.0">
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
          ${tocManifest}
        </manifest>
        <spine toc="ncx">
          ${spine}
        </spine>
        <guide>
            <reference type="cover" title="Cover" href="cover.xhtml" />
        </guide>
      </package>
    `.trim());

    // Generate EPUB
    const blob = await zip.generateAsync({ type: "blob" });
    const epubUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = epubUrl;
    a.download = fileName; // Use the original file name
    a.textContent = "Download EPUB";
    document.body.appendChild(a);
});
