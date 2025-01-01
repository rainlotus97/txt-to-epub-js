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
    let dimensions = { width: 0, height: 0 }
    if (coverFile) {
        dimensions = await getImageDimensionsFromFile(coverFile);
    }
    const coverExtension = coverFile ? coverFile.type.split("/")[1] : '';  // Get file extension (e.g., 'jpg')
    const bookName = extractBookTitle(txtFile.name);
    const fileName = bookName + ".epub"; // Use file name for EPUB
    // Step 1: 读取文件内容
    const fileContent = await readFileAsArrayBuffer(txtFile);

    // Step 2: 检测文件编码（简单假设 UTF-8 或 GBK）
    const detectedEncoding = detectEncoding(fileContent) || 'utf-8';

    // Step 3: 解码文件内容
    const decoder = new TextDecoder(detectedEncoding); // 使用 TextDecoder
    const txtContent = decoder.decode(fileContent).trim();

    // Extract author if declared as "作者: xxx" or "作者：xxx"
    const authorMatch = txtContent.match(/作者[:：]\s*(.+)/);
    const author = authorMatch ? authorMatch[1].trim() : (authorInput.value || "Unknown");

    // Regular expression to detect chapters and volumes
    const chapterRegex = /(?:^|\n)(第[一二三四五六七八九十0-9]+[章卷][^\n]*|楔子|引言|序章[^\n]*)/g;

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
          <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
        </rootfiles>
      </container>
    `.trim());

    const navPoints = chapters.map(
        (chapter, index) => {
            const id = `chapter${index + 1}`;
            const playOrder = index + 2; // 封页的 playOrder 为 1
            return (`
            <navPoint id="navPoint-${id}" playOrder="${playOrder}">
              <navLabel>
                <text>${chapter.title}</text>
              </navLabel>
              <content src="./OEBPS/${id}.xhtml" />
            </navPoint>
          `).trim();
        }).join("\n");

    // 封页声明
    const coverNavPoint = coverFile ? `
    <navPoint id="titlepage" playOrder="1">
      <navLabel>
        <text>封面</text>
      </navLabel>
      <content src="titlepage.xhtml" />
    </navPoint>
  `: "";

    zip.folder("").file("toc.ncx", `
    <?xml version="1.0" encoding="UTF-8"?>
    <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
      <head>
        <meta name="dtb:uid" content="book-id" />
        <meta name="dtb:depth" content="1" />
        <meta name="dtb:totalPageCount" content="0" />
        <meta name="dtb:maxPageNumber" content="0" />
      </head>
      <docTitle>
        <text>${bookName}</text>
      </docTitle>
      <docAuthor>
        <text>${author}</text>
      </docAuthor>
      <navMap>
        ${coverNavPoint}
        ${navPoints}
      </navMap>
    </ncx>
    `.trim());

    // Add OEBPS/content.opf
    const manifest = chapters.map((_, index) => `
        <item id="chap${index + 1}" href="OEBPS/chapter${index + 1}.xhtml" media-type="application/xhtml+xml"/>
    `).join("\n").trim();
    let spine = chapters.map((_, index) => `
        <itemref idref="chap${index + 1}"/>`
    ).join("\n").trim();

    // Add chapters as separate XHTML files with inline CSS for paragraph indentation
    const css = `body { font-family: Arial, sans-serif; line-height: 1.6; }p { text-indent: 2em; margin: 0; }`;

    zip.folder("").file("style.css", css);

    chapters.forEach((chapter, index) => {
        zip.folder("OEBPS").file(`chapter${index + 1}.xhtml`, `
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
        <html xmlns="http://www.w3.org/1999/xhtml" lang="zh">
          <head>
            <title>${chapter.title}</title>
            <link rel="stylesheet" type="text/css" href="../style.css"/>
          </head>
          <body>${chapter.content}</body>
        </html>
      `.trim());
    });

    const coverFilename = `cover.${coverExtension}`;
    let coverManifest = coverFile ? `<item id="coverPage" href="${coverFilename}" media-type="${coverFile.type}"/>` : "";
    // Add cover image if provided
    if (coverFile) {
        const coverData = await coverFile.arrayBuffer();

        zip.folder("").file(coverFilename, coverData);

        // 添加封面页面
        zip.folder("").file(
            "titlepage.xhtml",
            `
          <?xml version='1.0' encoding='utf-8'?>
            <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
                <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
                    <meta name="calibre:cover" content="true"/>
                    <title>Cover</title>
                </head>
                <body>
                    <div>
                        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100%" height="100%" viewBox="0 0 ${dimensions.width} ${dimensions.height}" preserveAspectRatio="none">
                            <image width="${dimensions.width}" height="${dimensions.height}" xlink:href="${coverFilename}"/>
                        </svg>
                    </div>
                </body>
            </html>
          `.trim()
        );

        // 在 manifest 中声明封面
        coverManifest = `${coverManifest}
        <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>`;

        // 在 spine 中添加封面页面
        spine = `<itemref idref="titlepage" />
        ${spine}`;
    }

    // Add cover image to manifest if provided
    const metaCover = coverFile ? `<meta name="cover" content="coverPage"></meta>` : "";
    const tocManifest = `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`;

    zip.folder("").file("content.opf", `
      <?xml version="1.0" encoding="UTF-8"?>
      <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="2.0">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>${bookName}</dc:title>
          <dc:language>zh</dc:language>
          <dc:creator>${author}</dc:creator>
          <dc:identifier id="book-id">${new Date().getTime()}</dc:identifier>
          ${metaCover}
        </metadata>
        <manifest>
          ${coverManifest}
          ${manifest}
          ${tocManifest}
        </manifest>
        <spine toc="ncx">
          ${spine}
        </spine>
        <guide>
            <reference type="cover" title="Cover" href="titlepage.xhtml" />
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
// 使用 ArrayBuffer 检测编码
function detectEncoding(buffer) {
    // 尝试 UTF-8 解码
    try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        console.log("检测结果: UTF-8");
        return 'utf-8';
    } catch (e) {
        console.log("UTF-8 解码失败，可能是 GBK 或其他编码");
    }

    // 如果 UTF-8 解码失败，假定 GBK（更复杂的检测需要其他工具）
    return 'gbk';
}


// 读取文件为 ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function extractBookTitle(filename) {
    const match = filename.match(/《([^》]+)》/);
    return match ? match[1] : filename.split('.')[0]; // 提取书名号中的内容
}

function getImageDimensionsFromFile(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file); // 创建临时 URL

        img.onload = () => {
            const width = img.naturalWidth;
            const height = img.naturalHeight;
            URL.revokeObjectURL(url); // 释放资源
            resolve({ width, height });
        };

        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(new Error("无法加载图片"));
        };

        img.src = url; // 加载图片
    });
}