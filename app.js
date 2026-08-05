"use strict";

const state = {
  items: [],
  canvases: [],
  dragIndex: null,
  renderToken: 0,
  cropTargetIndex: null,
  cropViewport: null,
  cropDrag: null,
  creatorClickCount: 0,
  creatorClickTimer: null,
  secretKeyBuffer: "",
};

const PAGE_PRESETS = {
  "4200x2970": { name: "A3 가로형", printWidthMm: 420, printHeightMm: 297 },
  "2970x2100": { name: "A4 가로형", printWidthMm: 297, printHeightMm: 210 },
  "3640x2570": { name: "B4 가로형", printWidthMm: 364, printHeightMm: 257 },
  "1920x1080": { name: "16:9 가로형", printWidthMm: 297, printHeightMm: 167.063 },
  "2560x1440": { name: "16:9 가로형 고화질", printWidthMm: 297, printHeightMm: 167.063 },
};

const elements = {
  conteDate: document.getElementById("conteDate"),
  fileName: document.getElementById("fileName"),
  columnsSelect: document.getElementById("columnsSelect"),
  pageSizeSelect: document.getElementById("pageSizeSelect"),
  autoTrim: document.getElementById("autoTrim"),
  showDividers: document.getElementById("showDividers"),
  resetBtn: document.getElementById("resetBtn"),
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  pasteBtn: document.getElementById("pasteBtn"),
  stretchAllBtn: document.getElementById("stretchAllBtn"),
  imageCount: document.getElementById("imageCount"),
  imageList: document.getElementById("imageList"),
  previewPages: document.getElementById("previewPages"),
  pageSummary: document.getElementById("pageSummary"),
  downloadBtn: document.getElementById("downloadBtn"),
  printBtn: document.getElementById("printBtn"),
  toast: document.getElementById("toast"),
  cropModal: document.getElementById("cropModal"),
  cropCanvas: document.getElementById("cropCanvas"),
  cropFileName: document.getElementById("cropFileName"),
  cropTop: document.getElementById("cropTop"),
  cropBottom: document.getElementById("cropBottom"),
  cropLeft: document.getElementById("cropLeft"),
  cropRight: document.getElementById("cropRight"),
  cropTopValue: document.getElementById("cropTopValue"),
  cropBottomValue: document.getElementById("cropBottomValue"),
  cropLeftValue: document.getElementById("cropLeftValue"),
  cropRightValue: document.getElementById("cropRightValue"),
  cropAutoBtn: document.getElementById("cropAutoBtn"),
  cropResetBtn: document.getElementById("cropResetBtn"),
  cropCancelBtn: document.getElementById("cropCancelBtn"),
  cropApplyBtn: document.getElementById("cropApplyBtn"),
  cropCloseBtn: document.getElementById("cropCloseBtn"),
  creatorCredit: document.getElementById("creatorCredit"),
  easterEggModal: document.getElementById("easterEggModal"),
  easterCloseBtn: document.getElementById("easterCloseBtn"),
  youthPhoto: document.getElementById("youthPhoto"),
  youthPhotoPlaceholder: document.getElementById("youthPhotoPlaceholder"),
  confettiLayer: document.getElementById("confettiLayer"),
};

init();

function init() {
  elements.conteDate.value = formatDateInput(new Date());
  bindEvents();
  requestRender();
}

function bindEvents() {
  elements.dropZone.addEventListener("click", () => elements.fileInput.click());
  elements.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.fileInput.click();
    }
  });

  elements.pasteBtn.addEventListener("click", pasteFromClipboard);
  elements.stretchAllBtn.addEventListener("click", stretchAllImages);
  elements.fileInput.addEventListener("change", async (event) => {
    await addFiles(event.target.files);
    event.target.value = "";
  });

  ["dragenter", "dragover"].forEach((type) => {
    elements.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    elements.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("drag-over");
    });
  });

  elements.dropZone.addEventListener("drop", async (event) => {
    await addFiles(event.dataTransfer.files);
  });

  [
    elements.columnsSelect,
    elements.pageSizeSelect,
    elements.autoTrim,
    elements.showDividers,
  ].forEach((element) => element.addEventListener("change", requestRender));

  elements.resetBtn.addEventListener("click", resetAll);
  elements.downloadBtn.addEventListener("click", downloadAllPages);
  elements.printBtn.addEventListener("click", printPages);

  [elements.cropTop, elements.cropBottom, elements.cropLeft, elements.cropRight].forEach((input) => {
    input.addEventListener("input", () => {
      clampCropInputs(input.id);
      updateCropPreview();
    });
  });

  elements.cropAutoBtn.addEventListener("click", setCropToAutoBounds);
  elements.cropResetBtn.addEventListener("click", () => setCropInputs({ top: 0, bottom: 0, left: 0, right: 0 }));
  elements.cropApplyBtn.addEventListener("click", applyManualCrop);
  elements.cropCancelBtn.addEventListener("click", closeCropModal);
  elements.cropCloseBtn.addEventListener("click", closeCropModal);
  document.querySelectorAll("[data-crop-close]").forEach((element) => element.addEventListener("click", closeCropModal));
  elements.creatorCredit.addEventListener("click", handleCreatorCreditClick);
  elements.easterCloseBtn.addEventListener("click", closeEasterEgg);
  document.querySelectorAll("[data-easter-close]").forEach((element) => element.addEventListener("click", closeEasterEgg));
  elements.youthPhoto.addEventListener("load", showYouthPhoto);
  elements.youthPhoto.addEventListener("error", showYouthPhotoPlaceholder);
  if (elements.youthPhoto.complete) {
    elements.youthPhoto.naturalWidth ? showYouthPhoto() : showYouthPhotoPlaceholder();
  }

  document.addEventListener("paste", handleDocumentPaste);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!elements.cropModal.hidden) closeCropModal();
      if (!elements.easterEggModal.hidden) closeEasterEgg();
      return;
    }
    captureEasterEggKeys(event);
  });

  elements.cropCanvas.addEventListener("pointerdown", startCropPointerDrag);
  elements.cropCanvas.addEventListener("pointermove", handleCropPointerMove);
  elements.cropCanvas.addEventListener("pointerup", stopCropPointerDrag);
  elements.cropCanvas.addEventListener("pointercancel", stopCropPointerDrag);
  elements.cropCanvas.addEventListener("pointerleave", handleCropPointerLeave);
  elements.cropCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
}


function makeClipboardFile(blob, index = 0) {
  const extensionByType = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const extension = extensionByType[blob.type] || "png";
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = index > 0 ? `_${index + 1}` : "";
  return new File([blob], `붙여넣은_악보_${timestamp}${suffix}.${extension}`, { type: blob.type || "image/png" });
}

function getImageFilesFromClipboardData(clipboardData) {
  if (!clipboardData) return [];

  const files = Array.from(clipboardData.files || []).filter((file) => file.type.startsWith("image/"));
  if (files.length) return files;

  return Array.from(clipboardData.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item, index) => {
      const blob = item.getAsFile();
      return blob ? makeClipboardFile(blob, index) : null;
    })
    .filter(Boolean);
}

async function handleDocumentPaste(event) {
  const imageFiles = getImageFilesFromClipboardData(event.clipboardData);
  if (!imageFiles.length) return;

  event.preventDefault();
  await addFiles(imageFiles, { source: "clipboard" });
}

async function pasteFromClipboard() {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
    showToast("이 브라우저에서는 버튼 붙여넣기가 제한됩니다. 복사 후 Ctrl+V를 눌러 주세요.");
    return;
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    const imageFiles = [];

    for (const clipboardItem of clipboardItems) {
      const imageType = clipboardItem.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;
      const blob = await clipboardItem.getType(imageType);
      imageFiles.push(makeClipboardFile(blob, imageFiles.length));
    }

    if (!imageFiles.length) {
      showToast("클립보드에 복사된 이미지가 없습니다.");
      return;
    }

    await addFiles(imageFiles, { source: "clipboard" });
  } catch (error) {
    console.error(error);
    showToast("클립보드 접근이 차단되었습니다. 복사 후 Ctrl+V를 눌러 주세요.");
  }
}


async function addFiles(fileList, options = {}) {
  const imageFiles = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));

  if (!imageFiles.length) {
    showToast("PNG, JPG 또는 WEBP 이미지 파일을 선택해 주세요.");
    return;
  }

  const loadedItems = [];

  for (const file of imageFiles) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImage(dataUrl);
      loadedItems.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        name: file.name.replace(/\.[^.]+$/, ""),
        fileName: file.name,
        image,
        dataUrl,
        zoom: 100,
        align: "top",
        fitMode: "contain",
        autoTrimRect: null,
        manualCropRect: null,
      });
    } catch (error) {
      console.error(error);
      showToast(`${file.name} 파일을 불러오지 못했습니다.`);
    }
  }

  state.items.push(...loadedItems);
  renderImageList();
  await requestRender();

  if (loadedItems.length) {
    const action = options.source === "clipboard" ? "붙여넣었습니다" : "추가했습니다";
    showToast(`${loadedItems.length}개의 악보 이미지를 ${action}.`);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 로드 실패"));
    image.src = src;
  });
}

function renderImageList() {
  elements.imageCount.textContent = `${state.items.length}곡`;
  elements.stretchAllBtn.disabled = state.items.length === 0;

  if (!state.items.length) {
    elements.imageList.className = "image-list empty";
    elements.imageList.innerHTML = `
      <div class="empty-list-message">
        <strong>아직 추가된 악보가 없습니다.</strong>
        <span>이미지를 넣으면 곡별 미리보기와 조정 메뉴가 표시됩니다.</span>
      </div>`;
    return;
  }

  elements.imageList.className = "image-list";
  elements.imageList.innerHTML = "";

  state.items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "image-card";
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="drag-handle" draggable="true" role="button" tabindex="0" title="이 점을 끌어 순서 변경" aria-label="${escapeHtml(item.name)} 순서 변경">⋮⋮</div>
      <div class="card-thumb"><img src="${item.dataUrl}" alt="${escapeHtml(item.name)} 미리보기" /></div>
      <div class="card-info">
        <div class="card-title-row">
          <span class="order-badge">${index + 1}</span>
          <p class="card-name" title="${escapeHtml(item.fileName)}">${escapeHtml(item.name)}</p>
          ${item.manualCropRect ? '<span class="crop-status">수동 자르기 적용</span>' : ""}
        </div>
        <div class="card-controls">
          <div class="mini-field zoom-field">
            <span class="mini-field-label">확대·축소 <span class="zoom-value">${item.zoom}%</span></span>
            <div class="zoom-control-row">
              <button type="button" class="zoom-step-button" data-action="zoomOut" aria-label="${escapeHtml(item.name)} 축소">−</button>
              <input type="range" min="70" max="160" step="1" value="${item.zoom}" data-action="zoom" aria-label="${escapeHtml(item.name)} 확대·축소" />
              <button type="button" class="zoom-step-button" data-action="zoomIn" aria-label="${escapeHtml(item.name)} 확대">＋</button>
            </div>
          </div>
          <label class="mini-field">
            세로 정렬
            <select data-action="align">
              <option value="top" ${item.align === "top" ? "selected" : ""}>위쪽</option>
              <option value="center" ${item.align === "center" ? "selected" : ""}>가운데</option>
              <option value="bottom" ${item.align === "bottom" ? "selected" : ""}>아래쪽</option>
            </select>
          </label>
          <label class="mini-field">
            배치 방식
            <select data-action="fitMode">
              <option value="contain" ${item.fitMode === "contain" ? "selected" : ""}>비율 유지</option>
              <option value="stretchY" ${item.fitMode === "stretchY" ? "selected" : ""}>세로로 늘려 채우기</option>
            </select>
          </label>
        </div>
        <div class="card-action-row">
          <button type="button" class="card-action-button" data-action="crop">여백 직접 자르기</button>
          ${item.manualCropRect ? '<button type="button" class="card-action-button muted" data-action="clearCrop">수동 자르기 해제</button>' : ""}
        </div>
      </div>
      <button type="button" class="remove-button" data-action="remove" title="삭제" aria-label="${escapeHtml(item.name)} 삭제">×</button>`;

    bindCardEvents(card, index);
    elements.imageList.appendChild(card);
  });
}

function bindCardEvents(card, index) {
  const dragHandle = card.querySelector(".drag-handle");
  const zoomInput = card.querySelector('[data-action="zoom"]');
  const zoomValue = card.querySelector(".zoom-value");
  const zoomOutButton = card.querySelector('[data-action="zoomOut"]');
  const zoomInButton = card.querySelector('[data-action="zoomIn"]');
  const alignSelect = card.querySelector('[data-action="align"]');
  const fitModeSelect = card.querySelector('[data-action="fitMode"]');
  const cropButton = card.querySelector('[data-action="crop"]');
  const clearCropButton = card.querySelector('[data-action="clearCrop"]');
  const removeButton = card.querySelector('[data-action="remove"]');

  const setZoom = (nextZoom) => {
    const minZoom = Number(zoomInput.min);
    const maxZoom = Number(zoomInput.max);
    const normalizedZoom = Math.min(maxZoom, Math.max(minZoom, Math.round(nextZoom)));
    state.items[index].zoom = normalizedZoom;
    zoomInput.value = String(normalizedZoom);
    zoomValue.textContent = `${normalizedZoom}%`;
    zoomOutButton.disabled = normalizedZoom <= minZoom;
    zoomInButton.disabled = normalizedZoom >= maxZoom;
    requestRender();
  };

  zoomInput.addEventListener("input", () => setZoom(Number(zoomInput.value)));
  zoomOutButton.addEventListener("click", () => setZoom(state.items[index].zoom - 1));
  zoomInButton.addEventListener("click", () => setZoom(state.items[index].zoom + 1));
  setZoom(state.items[index].zoom);

  alignSelect.addEventListener("change", () => {
    state.items[index].align = alignSelect.value;
    requestRender();
  });

  fitModeSelect.addEventListener("change", () => {
    state.items[index].fitMode = fitModeSelect.value;
    requestRender();
  });

  cropButton.addEventListener("click", () => openCropModal(index));

  if (clearCropButton) {
    clearCropButton.addEventListener("click", () => {
      state.items[index].manualCropRect = null;
      renderImageList();
      requestRender();
      showToast("수동 자르기를 해제했습니다.");
    });
  }

  removeButton.addEventListener("click", () => {
    state.items.splice(index, 1);
    renderImageList();
    requestRender();
  });

  // 순서 변경은 왼쪽 손잡이에서만 시작합니다.
  // 카드 전체를 draggable로 두면 확대·축소 슬라이더 조작이 드래그로 오인될 수 있습니다.
  dragHandle.addEventListener("dragstart", (event) => {
    state.dragIndex = index;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.setDragImage(card, 18, 18);
  });

  dragHandle.addEventListener("dragend", () => {
    state.dragIndex = null;
    document.querySelectorAll(".image-card").forEach((element) => {
      element.classList.remove("dragging", "drag-target");
    });
  });

  card.addEventListener("dragover", (event) => {
    if (state.dragIndex === null) return;
    event.preventDefault();
    if (state.dragIndex !== index) card.classList.add("drag-target");
  });

  card.addEventListener("dragleave", () => card.classList.remove("drag-target"));

  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("drag-target");
    const fromIndex = state.dragIndex;
    const toIndex = index;
    if (fromIndex === null || fromIndex === toIndex) return;

    const [moved] = state.items.splice(fromIndex, 1);
    state.items.splice(toIndex, 0, moved);
    renderImageList();
    requestRender();
  });
}


function stretchAllImages() {
  if (!state.items.length) return;

  state.items.forEach((item) => {
    item.fitMode = "stretchY";
  });

  renderImageList();
  requestRender();
  showToast(`${state.items.length}개 악보를 세로로 늘려 채웠습니다.`);
}

function renderEmptyPreview() {
  const columns = Number(elements.columnsSelect.value);
  const [pageWidth, pageHeight] = elements.pageSizeSelect.value.split("x").map(Number);
  const pagePreset = getSelectedPagePreset();
  const previewScale = getPreviewPaperScale();
  const columnMarkers = Array.from({ length: columns }, (_, index) => `<span>${index + 1}</span>`).join("");

  state.canvases = [];
  elements.previewPages.className = "preview-pages empty-preview";
  elements.previewPages.innerHTML = `
    <div class="preview-placeholder">
      <div class="placeholder-page" style="--placeholder-columns: ${columns}; --preview-paper-scale: ${previewScale}; aspect-ratio: ${pageWidth} / ${pageHeight};">
        ${columnMarkers}
      </div>
      <strong>완성된 콘티가 여기에 표시됩니다.</strong>
    </div>`;
  elements.pageSummary.textContent = `${columns}곡 배치 · ${pagePreset.name} · ${pageWidth.toLocaleString()} × ${pageHeight.toLocaleString()}px`;
  elements.downloadBtn.disabled = true;
  elements.printBtn.disabled = true;
}

async function requestRender() {
  const token = ++state.renderToken;

  if (!state.items.length) {
    renderEmptyPreview();
    return;
  }

  elements.pageSummary.textContent = "콘티를 정리하고 있습니다…";

  try {
    if (elements.autoTrim.checked) {
      await Promise.all(
        state.items.map(async (item) => {
          if (!item.autoTrimRect) item.autoTrimRect = detectContentBounds(item.image);
        }),
      );
    }

    if (token !== state.renderToken) return;
    renderPreviewPages();
  } catch (error) {
    console.error(error);
    showToast("미리보기를 만드는 중 문제가 발생했습니다.");
  }
}

function renderPreviewPages() {
  const columns = Number(elements.columnsSelect.value);
  const [pageWidth, pageHeight] = elements.pageSizeSelect.value.split("x").map(Number);
  const previewScale = getPreviewPaperScale();
  const pages = chunkArray(state.items, columns);

  state.canvases = [];
  elements.previewPages.className = "preview-pages";
  elements.previewPages.innerHTML = "";

  pages.forEach((pageItems, pageIndex) => {
    const wrapper = document.createElement("article");
    wrapper.className = "page-preview";
    wrapper.style.setProperty("--preview-paper-scale", previewScale);

    const header = document.createElement("div");
    header.className = "page-preview-header";
    header.innerHTML = `<span>${pageIndex + 1}페이지 · ${pageItems.length}곡</span>`;

    const pageDownloadButton = document.createElement("button");
    pageDownloadButton.type = "button";
    pageDownloadButton.className = "page-download-button";
    pageDownloadButton.textContent = "이 페이지만 PNG 저장";
    pageDownloadButton.addEventListener("click", () => downloadCanvas(state.canvases[pageIndex], pageIndex));
    header.appendChild(pageDownloadButton);

    const canvas = document.createElement("canvas");
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    canvas.setAttribute("aria-label", `${pageIndex + 1}페이지 콘티 미리보기`);

    drawPage(canvas, pageItems, columns);
    state.canvases.push(canvas);

    wrapper.append(header, canvas);
    elements.previewPages.appendChild(wrapper);
  });

  const pageCount = pages.length;
  const pagePreset = getSelectedPagePreset();
  elements.pageSummary.textContent = `${state.items.length}곡 · ${pageCount}페이지 · ${pagePreset.name} · ${pageWidth.toLocaleString()} × ${pageHeight.toLocaleString()}px`;
  elements.downloadBtn.disabled = false;
  elements.printBtn.disabled = false;
}

function drawPage(canvas, pageItems, columns) {
  const context = canvas.getContext("2d", { alpha: false });
  const pageWidth = canvas.width;
  const pageHeight = canvas.height;
  const outerMargin = Math.round(pageWidth * 0.0125);
  const gap = Math.max(8, Math.round(pageWidth * 0.004));
  const usableWidth = pageWidth - outerMargin * 2 - gap * (columns - 1);
  const cellWidth = usableWidth / columns;
  const cellHeight = pageHeight - outerMargin * 2;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, pageWidth, pageHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  pageItems.forEach((item, cellIndex) => {
    const x = outerMargin + cellIndex * (cellWidth + gap);
    const y = outerMargin;
    drawImageIntoCell(context, item, x, y, cellWidth, cellHeight);
  });

  if (elements.showDividers.checked) {
    context.save();
    context.strokeStyle = "#e2e2e2";
    context.lineWidth = Math.max(1, Math.round(pageWidth / 1920));
    for (let i = 1; i < columns; i += 1) {
      const dividerX = outerMargin + i * cellWidth + (i - 0.5) * gap;
      context.beginPath();
      context.moveTo(dividerX, outerMargin);
      context.lineTo(dividerX, pageHeight - outerMargin);
      context.stroke();
    }
    context.restore();
  }
}

function getSourceRect(item) {
  if (item.manualCropRect) return item.manualCropRect;
  if (elements.autoTrim.checked && item.autoTrimRect) return item.autoTrimRect;
  return { x: 0, y: 0, width: item.image.naturalWidth, height: item.image.naturalHeight };
}

function drawImageIntoCell(context, item, cellX, cellY, cellWidth, cellHeight) {
  const sourceRect = getSourceRect(item);
  const safePadding = Math.max(2, Math.round(cellWidth * 0.008));
  const availableWidth = cellWidth - safePadding * 2;
  const availableHeight = cellHeight - safePadding * 2;
  const zoomScale = item.zoom / 100;

  let drawWidth;
  let drawHeight;

  if (item.fitMode === "stretchY") {
    drawWidth = availableWidth * zoomScale;
    drawHeight = availableHeight * zoomScale;
  } else {
    const baseScale = Math.min(availableWidth / sourceRect.width, availableHeight / sourceRect.height);
    const finalScale = baseScale * zoomScale;
    drawWidth = sourceRect.width * finalScale;
    drawHeight = sourceRect.height * finalScale;
  }

  const drawX = cellX + (cellWidth - drawWidth) / 2;
  let drawY;
  if (item.align === "top") {
    drawY = cellY + safePadding;
  } else if (item.align === "bottom") {
    drawY = cellY + cellHeight - drawHeight - safePadding;
  } else {
    drawY = cellY + (cellHeight - drawHeight) / 2;
  }

  context.save();
  context.beginPath();
  context.rect(cellX, cellY, cellWidth, cellHeight);
  context.clip();
  context.drawImage(
    item.image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
  context.restore();
}

function detectContentBounds(image) {
  const maxScanSize = 1500;
  const ratio = Math.min(1, maxScanSize / Math.max(image.naturalWidth, image.naturalHeight));
  const scanWidth = Math.max(1, Math.round(image.naturalWidth * ratio));
  const scanHeight = Math.max(1, Math.round(image.naturalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = scanWidth;
  canvas.height = scanHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, scanWidth, scanHeight);
  context.drawImage(image, 0, 0, scanWidth, scanHeight);

  const { data } = context.getImageData(0, 0, scanWidth, scanHeight);
  const cornerColors = getCornerColors(data, scanWidth, scanHeight);
  const background = medianColor(cornerColors);
  const rowCounts = new Uint32Array(scanHeight);
  const columnCounts = new Uint32Array(scanWidth);

  for (let y = 0; y < scanHeight; y += 1) {
    for (let x = 0; x < scanWidth; x += 1) {
      const index = (y * scanWidth + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      if (alpha < 20) continue;

      const distance = Math.abs(red - background.r) + Math.abs(green - background.g) + Math.abs(blue - background.b);
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      const isContent = distance > 34 || luminance < 232;
      if (isContent) {
        rowCounts[y] += 1;
        columnCounts[x] += 1;
      }
    }
  }

  const minRowPixels = Math.max(2, Math.round(scanWidth * 0.001));
  const minColumnPixels = Math.max(2, Math.round(scanHeight * 0.001));
  const minY = firstIndexAtLeast(rowCounts, minRowPixels);
  const maxY = lastIndexAtLeast(rowCounts, minRowPixels);
  const minX = firstIndexAtLeast(columnCounts, minColumnPixels);
  const maxX = lastIndexAtLeast(columnCounts, minColumnPixels);

  if (minX < 0 || minY < 0 || maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  }

  const padding = Math.max(6, Math.round(Math.min(scanWidth, scanHeight) * 0.01));
  const paddedMinX = Math.max(0, minX - padding);
  const paddedMinY = Math.max(0, minY - padding);
  const paddedMaxX = Math.min(scanWidth - 1, maxX + padding);
  const paddedMaxY = Math.min(scanHeight - 1, maxY + padding);

  return {
    x: Math.round(paddedMinX / ratio),
    y: Math.round(paddedMinY / ratio),
    width: Math.max(1, Math.round((paddedMaxX - paddedMinX + 1) / ratio)),
    height: Math.max(1, Math.round((paddedMaxY - paddedMinY + 1) / ratio)),
  };
}

function getCornerColors(data, width, height) {
  const sampleSize = Math.max(2, Math.round(Math.min(width, height) * 0.025));
  const colors = [];
  const origins = [
    [0, 0],
    [Math.max(0, width - sampleSize), 0],
    [0, Math.max(0, height - sampleSize)],
    [Math.max(0, width - sampleSize), Math.max(0, height - sampleSize)],
  ];

  origins.forEach(([startX, startY]) => {
    for (let y = startY; y < Math.min(height, startY + sampleSize); y += 2) {
      for (let x = startX; x < Math.min(width, startX + sampleSize); x += 2) {
        const index = (y * width + x) * 4;
        colors.push({ r: data[index], g: data[index + 1], b: data[index + 2] });
      }
    }
  });
  return colors;
}

function medianColor(colors) {
  if (!colors.length) return { r: 255, g: 255, b: 255 };
  const reds = colors.map((color) => color.r).sort((a, b) => a - b);
  const greens = colors.map((color) => color.g).sort((a, b) => a - b);
  const blues = colors.map((color) => color.b).sort((a, b) => a - b);
  const middle = Math.floor(colors.length / 2);
  return { r: reds[middle], g: greens[middle], b: blues[middle] };
}

function firstIndexAtLeast(values, threshold) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] >= threshold) return index;
  }
  return -1;
}

function lastIndexAtLeast(values, threshold) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] >= threshold) return index;
  }
  return -1;
}

function openCropModal(index) {
  const item = state.items[index];
  if (!item) return;
  state.cropTargetIndex = index;
  elements.cropFileName.textContent = item.fileName;

  const baseRect = item.manualCropRect || item.autoTrimRect || {
    x: 0,
    y: 0,
    width: item.image.naturalWidth,
    height: item.image.naturalHeight,
  };
  setCropInputs(rectToCropPercentages(baseRect, item.image));
  elements.cropModal.hidden = false;
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(updateCropPreview);
}

function closeCropModal() {
  if (state.cropDrag) stopCropPointerDrag({ pointerId: state.cropDrag.pointerId });
  elements.cropModal.hidden = true;
  document.body.classList.remove("modal-open");
  state.cropTargetIndex = null;
  state.cropViewport = null;
  state.cropDrag = null;
  elements.cropCanvas.style.cursor = "default";
}

function rectToCropPercentages(rect, image) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  return {
    top: (rect.y / height) * 100,
    bottom: ((height - rect.y - rect.height) / height) * 100,
    left: (rect.x / width) * 100,
    right: ((width - rect.x - rect.width) / width) * 100,
  };
}

function setCropInputs(values) {
  elements.cropTop.value = clampNumber(values.top, 0, 85).toFixed(1);
  elements.cropBottom.value = clampNumber(values.bottom, 0, 85).toFixed(1);
  elements.cropLeft.value = clampNumber(values.left, 0, 85).toFixed(1);
  elements.cropRight.value = clampNumber(values.right, 0, 85).toFixed(1);
  clampCropInputs();
  updateCropPreview();
}

function getCropValues() {
  return {
    top: Number(elements.cropTop.value),
    bottom: Number(elements.cropBottom.value),
    left: Number(elements.cropLeft.value),
    right: Number(elements.cropRight.value),
  };
}

function clampCropInputs(changedId = "") {
  const values = getCropValues();
  const maxCombined = 95;

  if (values.top + values.bottom > maxCombined) {
    if (changedId === "cropTop") values.bottom = maxCombined - values.top;
    else values.top = maxCombined - values.bottom;
  }
  if (values.left + values.right > maxCombined) {
    if (changedId === "cropLeft") values.right = maxCombined - values.left;
    else values.left = maxCombined - values.right;
  }

  elements.cropTop.value = clampNumber(values.top, 0, 85).toFixed(1);
  elements.cropBottom.value = clampNumber(values.bottom, 0, 85).toFixed(1);
  elements.cropLeft.value = clampNumber(values.left, 0, 85).toFixed(1);
  elements.cropRight.value = clampNumber(values.right, 0, 85).toFixed(1);

  elements.cropTopValue.textContent = `${Number(elements.cropTop.value).toFixed(1)}%`;
  elements.cropBottomValue.textContent = `${Number(elements.cropBottom.value).toFixed(1)}%`;
  elements.cropLeftValue.textContent = `${Number(elements.cropLeft.value).toFixed(1)}%`;
  elements.cropRightValue.textContent = `${Number(elements.cropRight.value).toFixed(1)}%`;
}

function setCropToAutoBounds() {
  const item = state.items[state.cropTargetIndex];
  if (!item) return;
  item.autoTrimRect = detectContentBounds(item.image);
  setCropInputs(rectToCropPercentages(item.autoTrimRect, item.image));
}

function updateCropPreview() {
  const item = state.items[state.cropTargetIndex];
  if (!item || elements.cropModal.hidden) return;

  clampCropInputs();
  const canvas = elements.cropCanvas;
  const context = canvas.getContext("2d", { alpha: false });
  const image = item.image;
  const margin = 22;
  const scale = Math.min(
    (canvas.width - margin * 2) / image.naturalWidth,
    (canvas.height - margin * 2) / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = (canvas.width - drawWidth) / 2;
  const drawY = (canvas.height - drawHeight) / 2;

  context.fillStyle = "#e7e5df";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  const values = getCropValues();
  const cropX = drawX + drawWidth * (values.left / 100);
  const cropY = drawY + drawHeight * (values.top / 100);
  const cropWidth = drawWidth * (1 - (values.left + values.right) / 100);
  const cropHeight = drawHeight * (1 - (values.top + values.bottom) / 100);

  state.cropViewport = {
    drawX,
    drawY,
    drawWidth,
    drawHeight,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
  };

  context.save();
  context.fillStyle = "rgba(25, 25, 22, 0.56)";
  context.beginPath();
  context.rect(drawX, drawY, drawWidth, drawHeight);
  context.rect(cropX, cropY, cropWidth, cropHeight);
  context.fill("evenodd");

  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.setLineDash([12, 8]);
  context.strokeRect(cropX, cropY, cropWidth, cropHeight);
  context.setLineDash([]);

  drawCropHandles(context, cropX, cropY, cropWidth, cropHeight);
  context.restore();
}

function drawCropHandles(context, x, y, width, height) {
  const handleSize = 16;
  const half = handleSize / 2;
  const points = getCropHandlePoints(x, y, width, height);

  context.fillStyle = "#ffffff";
  context.strokeStyle = "#596044";
  context.lineWidth = 2;

  Object.values(points).forEach((point) => {
    context.beginPath();
    context.rect(point.x - half, point.y - half, handleSize, handleSize);
    context.fill();
    context.stroke();
  });
}

function getCropHandlePoints(x, y, width, height) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const right = x + width;
  const bottom = y + height;
  return {
    nw: { x, y },
    n: { x: centerX, y },
    ne: { x: right, y },
    e: { x: right, y: centerY },
    se: { x: right, y: bottom },
    s: { x: centerX, y: bottom },
    sw: { x, y: bottom },
    w: { x, y: centerY },
  };
}

function getCropCanvasPoint(event) {
  const rect = elements.cropCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (elements.cropCanvas.width / Math.max(1, rect.width)),
    y: (event.clientY - rect.top) * (elements.cropCanvas.height / Math.max(1, rect.height)),
  };
}

function hitTestCropControl(point) {
  const viewport = state.cropViewport;
  if (!viewport) return null;

  const displayRect = elements.cropCanvas.getBoundingClientRect();
  const scaleToCanvas = elements.cropCanvas.width / Math.max(1, displayRect.width);
  const tolerance = 18 * scaleToCanvas;
  const handles = getCropHandlePoints(
    viewport.cropX,
    viewport.cropY,
    viewport.cropWidth,
    viewport.cropHeight,
  );

  const order = ["nw", "ne", "se", "sw", "n", "e", "s", "w"];
  for (const key of order) {
    const handle = handles[key];
    if (Math.abs(point.x - handle.x) <= tolerance && Math.abs(point.y - handle.y) <= tolerance) {
      return key;
    }
  }

  const withinX = point.x >= viewport.cropX && point.x <= viewport.cropX + viewport.cropWidth;
  const withinY = point.y >= viewport.cropY && point.y <= viewport.cropY + viewport.cropHeight;
  return withinX && withinY ? "move" : null;
}

function startCropPointerDrag(event) {
  if (elements.cropModal.hidden || !state.cropViewport) return;
  const point = getCropCanvasPoint(event);
  const mode = hitTestCropControl(point);
  if (!mode) return;

  event.preventDefault();
  elements.cropCanvas.setPointerCapture(event.pointerId);
  state.cropDrag = {
    pointerId: event.pointerId,
    mode,
    startPoint: point,
    initialValues: getCropValues(),
  };
  elements.cropCanvas.classList.add("is-cropping");
  elements.cropCanvas.style.cursor = getCropCursor(mode);
}

function handleCropPointerMove(event) {
  if (elements.cropModal.hidden || !state.cropViewport) return;
  const point = getCropCanvasPoint(event);

  if (!state.cropDrag) {
    elements.cropCanvas.style.cursor = getCropCursor(hitTestCropControl(point));
    return;
  }
  if (event.pointerId !== state.cropDrag.pointerId) return;

  event.preventDefault();
  const viewport = state.cropViewport;
  const dx = ((point.x - state.cropDrag.startPoint.x) / viewport.drawWidth) * 100;
  const dy = ((point.y - state.cropDrag.startPoint.y) / viewport.drawHeight) * 100;
  const values = { ...state.cropDrag.initialValues };
  const mode = state.cropDrag.mode;

  if (mode === "move") {
    moveCropSelection(values, dx, dy);
  } else {
    if (mode.includes("n")) values.top += dy;
    if (mode.includes("s")) values.bottom -= dy;
    if (mode.includes("w")) values.left += dx;
    if (mode.includes("e")) values.right -= dx;
    normalizeCropValues(values, mode);
  }

  setCropInputs(values);
}

function stopCropPointerDrag(event = {}) {
  if (!state.cropDrag) return;
  if (event.pointerId !== undefined && event.pointerId !== state.cropDrag.pointerId) return;

  const pointerId = state.cropDrag.pointerId;
  try {
    if (elements.cropCanvas.hasPointerCapture(pointerId)) {
      elements.cropCanvas.releasePointerCapture(pointerId);
    }
  } catch (error) {
    // 포인터 캡처가 이미 해제된 경우 무시합니다.
  }

  state.cropDrag = null;
  elements.cropCanvas.classList.remove("is-cropping");
}

function handleCropPointerLeave(event) {
  if (!state.cropDrag) elements.cropCanvas.style.cursor = "default";
  if (state.cropDrag && event.buttons === 0) stopCropPointerDrag(event);
}

function moveCropSelection(values, dx, dy) {
  const visibleWidth = 100 - values.left - values.right;
  const visibleHeight = 100 - values.top - values.bottom;

  let left = values.left + dx;
  let top = values.top + dy;
  left = clampNumber(left, 0, 100 - visibleWidth);
  top = clampNumber(top, 0, 100 - visibleHeight);

  values.left = left;
  values.right = 100 - visibleWidth - left;
  values.top = top;
  values.bottom = 100 - visibleHeight - top;
}

function normalizeCropValues(values, changedMode = "") {
  const minimumVisible = 5;
  values.top = clampNumber(values.top, 0, 95);
  values.bottom = clampNumber(values.bottom, 0, 95);
  values.left = clampNumber(values.left, 0, 95);
  values.right = clampNumber(values.right, 0, 95);

  if (values.top + values.bottom > 100 - minimumVisible) {
    if (changedMode.includes("n")) values.top = 100 - minimumVisible - values.bottom;
    else values.bottom = 100 - minimumVisible - values.top;
  }
  if (values.left + values.right > 100 - minimumVisible) {
    if (changedMode.includes("w")) values.left = 100 - minimumVisible - values.right;
    else values.right = 100 - minimumVisible - values.left;
  }
}

function getCropCursor(mode) {
  const cursors = {
    nw: "nwse-resize",
    se: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    move: "move",
  };
  return cursors[mode] || "default";
}

function applyManualCrop() {
  const item = state.items[state.cropTargetIndex];
  if (!item) return;
  const values = getCropValues();
  const imageWidth = item.image.naturalWidth;
  const imageHeight = item.image.naturalHeight;
  const x = Math.round(imageWidth * values.left / 100);
  const y = Math.round(imageHeight * values.top / 100);
  const right = Math.round(imageWidth * values.right / 100);
  const bottom = Math.round(imageHeight * values.bottom / 100);

  item.manualCropRect = {
    x,
    y,
    width: Math.max(1, imageWidth - x - right),
    height: Math.max(1, imageHeight - y - bottom),
  };

  closeCropModal();
  renderImageList();
  requestRender();
  showToast("선택한 여백 자르기를 적용했습니다.");
}


function handleCreatorCreditClick() {
  state.creatorClickCount += 1;
  window.clearTimeout(state.creatorClickTimer);
  state.creatorClickTimer = window.setTimeout(() => {
    state.creatorClickCount = 0;
  }, 2800);

  if (state.creatorClickCount >= 5) {
    state.creatorClickCount = 0;
    openEasterEgg();
  }
}

function captureEasterEggKeys(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
  state.secretKeyBuffer = `${state.secretKeyBuffer}${event.key.toLowerCase()}`.slice(-5);
  if (state.secretKeyBuffer === "hyein") {
    state.secretKeyBuffer = "";
    openEasterEgg();
  }
}

function openEasterEgg() {
  elements.easterEggModal.hidden = false;
  document.body.classList.add("modal-open");
  launchEasterConfetti();
}

function closeEasterEgg() {
  elements.easterEggModal.hidden = true;
  if (elements.cropModal.hidden) document.body.classList.remove("modal-open");
  elements.confettiLayer.innerHTML = "";
}

function showYouthPhoto() {
  elements.youthPhoto.hidden = false;
  elements.youthPhotoPlaceholder.hidden = true;
}

function showYouthPhotoPlaceholder() {
  elements.youthPhoto.hidden = true;
  elements.youthPhotoPlaceholder.hidden = false;
}

function launchEasterConfetti() {
  const colors = ["#7a8161", "#d4b36a", "#d9a6a0", "#9caac4", "#c6ca9e"];
  elements.confettiLayer.innerHTML = "";
  for (let index = 0; index < 32; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.32}s`;
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty("--spin", `${360 + Math.random() * 720}deg`);
    elements.confettiLayer.appendChild(piece);
  }
}

function getPreviewPaperScale() {
  const selectedValue = elements.pageSizeSelect.value;

  // 화면용 16:9 규격은 미리보기 영역을 넓게 사용합니다.
  if (selectedValue === "1920x1080" || selectedValue === "2560x1440") {
    return 1;
  }

  // 실제 용지 크기 차이는 유지하되, A4·B4가 지나치게 작아 보이지 않도록
  // 가로 길이 비율을 완만하게 압축해 화면용 배율로 변환합니다.
  const selectedPreset = getSelectedPagePreset();
  const a3WidthMm = PAGE_PRESETS["4200x2970"].printWidthMm;
  const physicalRatio = selectedPreset.printWidthMm / a3WidthMm;
  return Math.min(1, 0.6 + physicalRatio * 0.4);
}

function getSelectedPagePreset() {
  return PAGE_PRESETS[elements.pageSizeSelect.value] || PAGE_PRESETS["4200x2970"];
}

function applyPrintPageSize() {
  const preset = getSelectedPagePreset();
  let style = document.getElementById("dynamicPrintPageSize");
  if (!style) {
    style = document.createElement("style");
    style.id = "dynamicPrintPageSize";
    document.head.appendChild(style);
  }

  const width = preset.printWidthMm;
  const height = preset.printHeightMm;
  style.textContent = `
    @page { size: ${width}mm ${height}mm; margin: 0; }
    @media print {
      html, body {
        width: ${width}mm !important;
        min-width: ${width}mm !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .page-preview {
        width: ${width}mm !important;
        height: ${height}mm !important;
        overflow: hidden !important;
      }
      .page-preview canvas {
        width: ${width}mm !important;
        height: ${height}mm !important;
        object-fit: fill !important;
      }
    }
  `;
}

function printPages() {
  if (!state.canvases.length) return;
  applyPrintPageSize();
  const preset = getSelectedPagePreset();
  showToast(`${preset.name} 크기로 인쇄 창을 엽니다. 실제 프린터 또는 PDF 저장을 선택해 주세요.`);
  window.setTimeout(() => window.print(), 200);
}

function downloadAllPages() {
  if (!state.canvases.length) return;

  state.canvases.forEach((canvas, index) => {
    window.setTimeout(() => downloadCanvas(canvas, index), index * 450);
  });

  showToast(
    state.canvases.length === 1
      ? "콘티 PNG 파일을 저장합니다."
      : `${state.canvases.length}개의 페이지를 순서대로 저장합니다.`,
  );
}

function downloadCanvas(canvas, pageIndex) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png", 1);
  link.download = buildFileName(pageIndex);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function buildFileName(pageIndex) {
  const date = elements.conteDate.value || formatDateInput(new Date());
  const rawName = elements.fileName.value.trim();
  const safeName = rawName.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
  const pageSuffix = state.canvases.length > 1 ? `_p${pageIndex + 1}` : "";
  const namePart = safeName ? `_${safeName}` : "";
  return `${date}${namePart}${pageSuffix}.png`;
}

function resetAll() {
  if (state.items.length && !window.confirm("추가한 악보와 설정을 모두 초기화할까요?")) return;

  state.items = [];
  state.canvases = [];
  elements.columnsSelect.value = "3";
  elements.pageSizeSelect.value = "4200x2970";
  elements.autoTrim.checked = true;
  elements.showDividers.checked = false;
  elements.conteDate.value = formatDateInput(new Date());
  elements.fileName.value = "";
  renderImageList();
  requestRender();
  showToast("초기화했습니다.");
}

function chunkArray(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) chunks.push(array.slice(index, index + size));
  return chunks;
}

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer;
function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}
