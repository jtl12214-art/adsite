$(function () {
    const imageInput = document.getElementById("image-input");
    const previewImage = document.getElementById("preview-image");
    const previewCanvas = document.getElementById("preview-canvas");
    const saveButton = document.getElementById("save-button");
    const maxCanvasDimension = 16384;
    const maxCanvasPixels = 64 * 1000 * 1000;

    let selectedImage = null;
    let originalFileName = "pixfit-image";
    let selectedRatio = "4:5";
    let selectedColor = "#ffffff";
    let selectedSaveFormat = "png";

    function updateSaveNote(message) {
        const formatLabel = selectedSaveFormat === "jpeg" ? "JPEG" : "PNG";
        $("#save-note").text(message || `${formatLabel} 파일로 저장됩니다.`);
    }

    function setSaveInProgress(isSaving) {
        $("#save-button, .save-format-button").prop("disabled", isSaving);
    }

    function showUploadError(message) {
        $("#upload-error").text(message);
    }

    function updatePreview() {
        const [ratioWidth, ratioHeight] = selectedRatio.split(":").map(Number);
        const ratio = ratioWidth / ratioHeight;
        const workspace = document.querySelector(".preview-workspace");
        const workspaceStyle = window.getComputedStyle(workspace);
        const horizontalPadding = parseFloat(workspaceStyle.paddingLeft) + parseFloat(workspaceStyle.paddingRight);
        const availableWidth = Math.max(0, workspace.clientWidth - horizontalPadding);
        const maxWidth = Math.min(330, availableWidth);
        const maxHeight = 430;
        let previewWidth = maxWidth;
        let previewHeight = previewWidth / ratio;

        if (previewHeight > maxHeight) {
            previewHeight = maxHeight;
            previewWidth = previewHeight * ratio;
        }

        $(previewCanvas)
            .css({
                "aspect-ratio": `${ratioWidth} / ${ratioHeight}`,
                width: `${previewWidth}px`,
                height: `${previewHeight}px`,
                "background-color": selectedColor
            });
        $("#preview-ratio").text(selectedRatio);
        $("#selected-ratio").text(selectedRatio);
    }

    function loadSelectedFile(file) {
        const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
        const supportedExtensions = /\.(jpe?g|png|webp)$/i;

        if (!file || (!supportedTypes.includes(file.type) && !supportedExtensions.test(file.name))) {
            showUploadError("JPG, PNG 또는 WEBP 이미지 파일을 선택해주세요.");
            imageInput.value = "";
            return;
        }

        showUploadError("");
        const reader = new FileReader();

        reader.onload = function (event) {
            const image = new Image();

            image.onload = function () {
                selectedImage = image;
                originalFileName = file.name.replace(/\.[^.]+$/, "") || "pixfit-image";
                previewImage.src = image.src;
                previewCanvas.classList.add("has-image");
                $("#file-name").text(file.name);
                $("#save-button").prop("disabled", false);
                updateSaveNote();
            };

            image.onerror = function () {
                selectedImage = null;
                showUploadError("이미지를 불러오지 못했습니다. 다른 파일을 선택해주세요.");
                $("#save-button").prop("disabled", true);
            };

            image.src = event.target.result;
        };

        reader.onerror = function () {
            showUploadError("파일을 읽지 못했습니다. 다시 선택해주세요.");
        };

        reader.readAsDataURL(file);
    }

    function getCanvasSize(image, ratio) {
        const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);
        const targetRatio = ratioWidth / ratioHeight;

        if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
            throw new Error("올바르지 않은 이미지 비율입니다.");
        }

        const imageRatio = image.naturalWidth / image.naturalHeight;

        if (imageRatio > targetRatio) {
            return {
                width: image.naturalWidth,
                height: Math.round(image.naturalWidth / targetRatio)
            };
        }

        return {
            width: Math.round(image.naturalHeight * targetRatio),
            height: image.naturalHeight
        };
    }

    function createResultCanvas(canvasSize) {
        const canvas = document.createElement("canvas");
        const imageScale = Math.min(
            canvasSize.width / selectedImage.naturalWidth,
            canvasSize.height / selectedImage.naturalHeight
        );
        const imageWidth = selectedImage.naturalWidth * imageScale;
        const imageHeight = selectedImage.naturalHeight * imageScale;
        const imageX = (canvasSize.width - imageWidth) / 2;
        const imageY = (canvasSize.height - imageHeight) / 2;

        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;
        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Canvas를 준비하지 못했습니다.");
        }

        context.fillStyle = selectedColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(selectedImage, imageX, imageY, imageWidth, imageHeight);

        return canvas;
    }

    function saveImage() {
        if (!selectedImage) {
            return;
        }

        const formatAtSave = selectedSaveFormat;
        const mimeType = formatAtSave === "jpeg" ? "image/jpeg" : "image/png";
        const extension = formatAtSave === "jpeg" ? "jpg" : "png";
        const formatLabel = formatAtSave === "jpeg" ? "JPEG" : "PNG";
        let canvas;

        try {
            const canvasSize = getCanvasSize(selectedImage, selectedRatio);
            const totalPixels = canvasSize.width * canvasSize.height;

            if (
                canvasSize.width > maxCanvasDimension ||
                canvasSize.height > maxCanvasDimension ||
                totalPixels > maxCanvasPixels
            ) {
                $("#save-note").text("출력 크기가 너무 커서 처리할 수 없습니다. 더 작은 이미지를 선택해주세요.");
                return;
            }

            canvas = createResultCanvas(canvasSize);
        } catch (error) {
            updateSaveNote("이미지를 처리하지 못했습니다. 다른 이미지나 비율을 선택해주세요.");
            return;
        }

        setSaveInProgress(true);
        $("#save-note").text("이미지를 준비하고 있습니다.");

        try {
            const handleBlob = function (blob) {
                if (!blob || blob.type !== mimeType) {
                    setSaveInProgress(false);
                    $("#save-note").text(`${formatLabel} 이미지로 저장할 수 없습니다. 다른 형식을 선택해주세요.`);
                    return;
                }

                const downloadUrl = URL.createObjectURL(blob);
                const downloadLink = document.createElement("a");
                downloadLink.href = downloadUrl;
                downloadLink.download = originalFileName + "-pixfit." + extension;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                downloadLink.remove();
                URL.revokeObjectURL(downloadUrl);

                setSaveInProgress(false);
                updateSaveNote(`${formatLabel} 파일로 저장했습니다.`);
            };

            if (formatAtSave === "jpeg") {
                canvas.toBlob(handleBlob, mimeType, 1.0);
            } else {
                canvas.toBlob(handleBlob, mimeType);
            }
        } catch (error) {
            setSaveInProgress(false);
            updateSaveNote("이미지를 저장하지 못했습니다. 더 작은 이미지를 선택해주세요.");
        }
    }

    $("#select-image-button").on("click", function () {
        imageInput.click();
    });

    $(imageInput).on("change", function (event) {
        loadSelectedFile(event.target.files[0]);
    });

    $(".ratio-category-button").on("click", function () {
        const selectedCategory = $(this).data("category");
        const $selectedPanel = $(`[data-category-panel="${selectedCategory}"]`);

        $(".ratio-category-button")
            .removeClass("is-active")
            .attr("aria-selected", "false");
        $(this)
            .addClass("is-active")
            .attr("aria-selected", "true");
        $(".ratio-panel").prop("hidden", true);
        $selectedPanel.prop("hidden", false);
        $selectedPanel.find(".ratio-button").first().trigger("click");
    });

    $(".ratio-button").on("click", function () {
        selectedRatio = $(this).data("ratio");
        $(".ratio-button").removeClass("is-active").attr("aria-pressed", "false");
        $(this).addClass("is-active").attr("aria-pressed", "true");
        updatePreview();
    });

    $(window).on("resize", updatePreview);

    $(".color-option[data-color]").on("click", function () {
        selectedColor = $(this).data("color");
        $(".color-option").removeClass("is-active").attr("aria-pressed", "false");
        $(this).addClass("is-active").attr("aria-pressed", "true");
        updatePreview();
    });

    $("#custom-color").on("input change", function () {
        selectedColor = this.value;
        $(".color-option").removeClass("is-active").attr("aria-pressed", "false");
        $("#custom-color-option").addClass("is-active").attr("aria-pressed", "true");
        updatePreview();
    });

    $(".save-format-button").on("click", function () {
        selectedSaveFormat = $(this).data("format");
        $(".save-format-button").removeClass("is-active").attr("aria-pressed", "false");
        $(this).addClass("is-active").attr("aria-pressed", "true");
        $("#jpeg-quality-note").prop("hidden", selectedSaveFormat !== "jpeg");
        updateSaveNote();
    });

    $(saveButton).on("click", saveImage);
    updatePreview();
});