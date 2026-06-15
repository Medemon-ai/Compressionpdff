document.addEventListener('DOMContentLoaded', () => {

    // --- Dark Mode ---
    const darkModeToggle = document.getElementById('darkModeToggle');
    const body = document.body;

    if (localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        body.classList.add('dark-mode');
        updateDarkModeIcon(true);
    }

    darkModeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        const isDark = body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateDarkModeIcon(isDark);
    });

    function updateDarkModeIcon(isDark) {
        const icon = darkModeToggle.querySelector('i');
        if (isDark) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }

    // --- Variables ---
    let currentFile = null;
    let originalArrayBuffer = null;

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const stepUpload = document.getElementById('uploadStep');
    const stepProcessing = document.getElementById('processingStep');
    const stepResult = document.getElementById('resultStep');

    // --- Drag & Drop ---
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
    });

    dropzone.addEventListener('drop', (e) => {
        handleFiles(e.dataTransfer.files);
    }, false);

    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        if (file.type !== 'application/pdf') {
            alert('PDFファイルを選択してください。');
            return;
        }
        currentFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            originalArrayBuffer = e.target.result;
            showProcessingStep();
        };
        reader.readAsArrayBuffer(file);
    }

    // --- Option Cards ---
    const optionCards = document.querySelectorAll('.option-card');
    optionCards.forEach(card => {
        card.addEventListener('click', function() {
            optionCards.forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            const radio = this.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });

    document.getElementById('cancelBtn').addEventListener('click', resetTool);

    function showProcessingStep() {
        stepUpload.classList.remove('active');
        stepProcessing.classList.add('active');
        document.getElementById('fileName').textContent = currentFile.name;
        document.getElementById('fileSizeOriginal').textContent = formatBytes(currentFile.size);
    }

    // --- Compression ---
    const COMPRESSION_PROFILES = {
        low:         { jpegQuality: 0.82, scale: 1.5 },
        recommended: { jpegQuality: 0.65, scale: 1.2 },
        max:         { jpegQuality: 0.40, scale: 0.9 },
    };

    const compressBtn = document.getElementById('compressBtn');

    compressBtn.addEventListener('click', async () => {
        if (!originalArrayBuffer) return;

        compressBtn.disabled = true;
        document.getElementById('cancelBtn').disabled = true;
        const progressContainer = document.getElementById('progressContainer');
        const progressBarFill = document.getElementById('progressBarFill');
        const progressText = document.getElementById('progressText');
        progressContainer.classList.remove('hidden');

        const setProgress = (pct) => {
            progressBarFill.style.width = `${pct}%`;
            progressText.textContent = `${Math.round(pct)}%`;
        };

        try {
            const checkedRadio = document.querySelector('input[name="compressionLevel"]:checked');
            const level = checkedRadio ? checkedRadio.value : 'recommended';
            const profile = COMPRESSION_PROFILES[level];

            setProgress(5);

            const pdfjsLib = window.pdfjsLib;
            if (!pdfjsLib) throw new Error('PDF.js load nahi hua. index.html check karo.');

            const pdfDoc_pdfjs = await pdfjsLib.getDocument({ data: originalArrayBuffer.slice(0) }).promise;
            const totalPages = pdfDoc_pdfjs.numPages;

            setProgress(10);

            const pageImages = [];
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                const page = await pdfDoc_pdfjs.getPage(pageNum);
                const viewport = page.getViewport({ scale: profile.scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport }).promise;
                const jpegDataUrl = canvas.toDataURL('image/jpeg', profile.jpegQuality);
                const jpegBytes = dataUrlToBytes(jpegDataUrl);
                pageImages.push({ jpegBytes, width: canvas.width, height: canvas.height });
                setProgress(Math.round(10 + ((pageNum / totalPages) * 70)));
            }

            setProgress(82);

            const { PDFDocument } = window.PDFLib;
            if (!PDFDocument) throw new Error('pdf-lib load nahi hua. index.html check karo.');

            const newPdf = await PDFDocument.create();
            for (const { jpegBytes, width, height } of pageImages) {
                const jpgImage = await newPdf.embedJpg(jpegBytes);
                const page = newPdf.addPage([width, height]);
                page.drawImage(jpgImage, { x: 0, y: 0, width, height });
            }

            setProgress(94);
            const pdfBytes = await newPdf.save({ useObjectStreams: true, addDefaultPage: false });
            setProgress(100);

            await new Promise(r => setTimeout(r, 400));
            showResultStep(pdfBytes, currentFile.size);

        } catch (error) {
            console.error('Compression Error:', error);
            alert('エラーが発生しました: ' + error.message);
            resetTool();
        }
    });

    // --- Result ---
    function showResultStep(processedBytes, originalSize) {
        stepProcessing.classList.remove('active');
        stepResult.classList.add('active');

        const blob = new Blob([processedBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const compressedSize = processedBytes.byteLength;
        const savedPercent = Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100));

        document.getElementById('statOriginal').textContent = formatBytes(originalSize);
        document.getElementById('statCompressed').textContent = formatBytes(compressedSize);
        document.getElementById('statSaved').textContent = `${savedPercent}%`;

        const downloadBtn = document.getElementById('downloadBtn');
        downloadBtn.href = url;
        const dotIndex = currentFile.name.lastIndexOf('.');
        const baseName = dotIndex !== -1 ? currentFile.name.substring(0, dotIndex) : currentFile.name;
        downloadBtn.download = `${baseName}_compressed.pdf`;
        document.getElementById('pdfPreview').src = url;
    }

    document.getElementById('resetBtn').addEventListener('click', resetTool);

    function resetTool() {
        currentFile = null;
        originalArrayBuffer = null;
        fileInput.value = '';
        document.getElementById('progressContainer').classList.add('hidden');
        document.getElementById('progressBarFill').style.width = '0%';
        document.getElementById('progressText').textContent = '0%';
        compressBtn.disabled = false;
        document.getElementById('cancelBtn').disabled = false;
        document.getElementById('pdfPreview').src = '';
        stepProcessing.classList.remove('active');
        stepResult.classList.remove('active');
        stepUpload.classList.add('active');
    }

    // --- Helpers ---
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
    }

    function dataUrlToBytes(dataUrl) {
        const binary = atob(dataUrl.split(',')[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    // --- FAQ Accordion ---
    document.querySelectorAll('.faq-item').forEach(item => {
        item.querySelector('.faq-question').addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            document.querySelectorAll('.faq-item').forEach(f => f.classList.remove('active'));
            if (!isActive) item.classList.add('active');
        });
    });

});
