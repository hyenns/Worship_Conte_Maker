"use strict";

const state = {
  items: [],
  canvases: [],
  dragIndex: null,
  renderToken: 0,
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
  addMoreBtn: document.getElementById("addMoreBtn"),
  imageCount: document.getElementById("imageCount"),
  imageList: document.getElementById("imageList"),
  previewPages: document.getElementById("previewPages"),
  pageSummary: document.getElementById("pageSummary"),
  downloadBtn: document.getElementById("downloadBtn"),
  printBtn: document.getElementById("printBtn"),
  toast: document.getElementById("toast"),
};

init();

function init() {
  elements.conteDate.value = formatDateInput(new Date());
  bindEvents();
}

function bindEvents() {
  elements.dropZone.addEventListener("click", () => elements.fileInput.click());
  elements.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.fileInput.click();
    }
  });

  elements.addMoreBtn.addEventListener("click", () => elements.fileInput.click());
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
  elements.printBtn.addEventListener("click", () => {
    if (!state.canvases.length) return;
    showToast("인쇄 창에서 프린터를 ‘PDF로 저장’으로 선택해 주세요.");
    window.setTimeout(() => window.print(), 250);
  });
}

async function addFiles(fileList) {
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
        align: "center",
        trimRect: null,
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
    showToast(`${loadedItems.length}개의 악보 이미지를 추가했습니다.`);
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
    card.draggable = true;
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="drag-handle" title="순서 변경">⋮⋮</div>
      <div class="card-thumb"><img src="${item.dataUrl}" alt="${escapeHtml(item.name)} 미리보기" /></div>
      <div class="card-info">
        <div class="card-title-row">
          <span class="order-badge">${index + 1}</span>
          <p class="card-name" title="${escapeHtml(item.fileName)}">${escapeHtml(item.name)}</p>
        </div>
        <div class="card-controls">
          <label class="mini-field">
            확대·축소 <span class="zoom-value">${item.zoom}%</span>
            <input type="range" min="80" max="145" step="1" value="${item.zoom}" data-action="zoom" />
          </label>
          <label class="mini-field">
            세로 정렬
            <select data-action="align">
              <option value="top" ${item.align === "top" ? "selected" : ""}>위쪽</option>
              <option value="center" ${item.align === "center" ? "selected" : ""}>가운데</option>
              <option value="bottom" ${item.align === "bottom" ? "selected" : ""}>아래쪽</option>
            </select>
          </label>
        </div>
      </div>
      <button type="button" class="remove-button" data-action="remove" title="삭제" aria-label="${escapeHtml(item.name)} 삭제">×</button>`;

    bindCardEvents(card, index);
    elements.imageList.appendChild(card);
  });
}

function bindCardEvents(card, index) {
  const zoomInput = card.querySelector('[data-action="zoom"]');
  const zoomValue = card.querySelector(".zoom-value");
  const alignSelect = card.querySelector('[data-action="align"]');
  const removeButton = card.querySelector('[data-action="remove"]');

  zoomInput.addEventListener("input", () => {
    state.items[index].zoom = Number(zoomInput.value);
    zoomValue.textContent = `${zoomInput.value}%`;
    requestRender();
  });

  alignSelect.addEventListener("change", () => {
    state.items[index].align = alignSelect.value;
    requestRender();
  });

  removeButton.addEventListener("click", () => {
    state.items.splice(index, 1);
    renderImageList();
    requestRender();
  });

  card.addEventListener("dragstart", (event) => {
    state.dragIndex = index;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  });

  card.addEventListener("dragend", () => {
    state.dragIndex = null;
    document.querySelectorAll(".image-card").forEach((element) => {
      element.classList.remove("dragging", "drag-target");
    });
  });

  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (state.dragIndex !== null && state.dragIndex !== index) {
      card.classList.add("drag-target");
    }
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

async function requestRender() {
  const token = ++state.renderToken;

  if (!state.items.length) {
    state.canvases = [];
    elements.previewPages.className = "preview-pages empty-preview";
    elements.previewPages.innerHTML = `
      <div class="preview-placeholder">
        <div class="placeholder-page"><span>1</span><span>2</span><span>3</span></div>
        <strong>완성된 콘티가 여기에 표시됩니다.</strong>
      </div>`;
    elements.pageSummary.textContent = "이미지를 추가하면 미리보기가 생성됩니다.";
    elements.downloadBtn.disabled = true;
    elements.printBtn.disabled = true;
    return;
  }

  elements.pageSummary.textContent = "콘티를 정리하고 있습니다…";

  try {
    if (elements.autoTrim.checked) {
      await Promise.all(
        state.items.map(async (item) => {
          if (!item.trimRect) item.trimRect = detectContentBounds(item.image);
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
  const pages = chunkArray(state.items, columns);

  state.canvases = [];
  elements.previewPages.className = "preview-pages";
  elements.previewPages.innerHTML = "";

  pages.forEach((pageItems, pageIndex) => {
    const wrapper = document.createElement("article");
    wrapper.className = "page-preview";

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
  elements.pageSummary.textContent = `${state.items.length}곡 · ${pageCount}페이지 · ${pageWidth.toLocaleString()} × ${pageHeight.toLocaleString()}px`;
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

function drawImageIntoCell(context, item, cellX, cellY, cellWidth, cellHeight) {
  const sourceRect = elements.autoTrim.checked
    ? item.trimRect || { x: 0, y: 0, width: item.image.naturalWidth, height: item.image.naturalHeight }
    : { x: 0, y: 0, width: item.image.naturalWidth, height: item.image.naturalHeight };

  const safePadding = Math.max(2, Math.round(cellWidth * 0.008));
  const availableWidth = cellWidth - safePadding * 2;
  const availableHeight = cellHeight - safePadding * 2;
  const baseScale = Math.min(availableWidth / sourceRect.width, availableHeight / sourceRect.height);
  const zoomScale = item.zoom / 100;
  const finalScale = baseScale * zoomScale;
  const drawWidth = sourceRect.width * finalScale;
  const drawHeight = sourceRect.height * finalScale;
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
  const maxScanSize = 1400;
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
  const threshold = 244;
  let minX = scanWidth;
  let minY = scanHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < scanHeight; y += 1) {
    for (let x = 0; x < scanWidth; x += 1) {
      const index = (y * scanWidth + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const isContent = alpha > 20 && (red < threshold || green < threshold || blue < threshold);

      if (isContent) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  }

  const padding = Math.max(5, Math.round(Math.min(scanWidth, scanHeight) * 0.008));
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(scanWidth - 1, maxX + padding);
  maxY = Math.min(scanHeight - 1, maxY + padding);

  return {
    x: Math.round(minX / ratio),
    y: Math.round(minY / ratio),
    width: Math.max(1, Math.round((maxX - minX + 1) / ratio)),
    height: Math.max(1, Math.round((maxY - minY + 1) / ratio)),
  };
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
  const rawName = elements.fileName.value.trim() || "찬양콘티";
  const safeName = rawName.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
  const pageSuffix = state.canvases.length > 1 ? `_p${pageIndex + 1}` : "";
  return `${date}_${safeName}${pageSuffix}.png`;
}

function resetAll() {
  if (state.items.length && !window.confirm("추가한 악보와 설정을 모두 초기화할까요?")) return;

  state.items = [];
  state.canvases = [];
  elements.columnsSelect.value = "3";
  elements.pageSizeSelect.value = "1920x1080";
  elements.autoTrim.checked = true;
  elements.showDividers.checked = false;
  elements.conteDate.value = formatDateInput(new Date());
  elements.fileName.value = "청년부_찬양콘티";
  renderImageList();
  requestRender();
  showToast("초기화했습니다.");
}

function chunkArray(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
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
