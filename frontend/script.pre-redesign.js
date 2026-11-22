
// =====================================
// BIRD GUARD AI - FRONTEND JAVASCRIPT
// =====================================


// =====================================
// PAGE NAVIGATION
// =====================================

const navLinks = document.querySelectorAll(".nav-link");
const pages = document.querySelectorAll(".page");
const pageTitle = document.getElementById("page-title");

const pageNames = {
    dashboard: "Dashboard Overview",
    live: "Live Bird Detection",
    identification: "Bird Identification",
    monitoring: "Pest Monitoring",
    history: "Detection History",
    reports: "Reports & Analytics",
    heatmap: "Field Activity Heatmap",
    iot: "IoT Sensor Monitoring",
    settings: "Settings"
};

function showPage(pageName) {
    pages.forEach(page => page.classList.remove("active"));
    navLinks.forEach(link => link.classList.remove("active"));

    const selectedPage = document.getElementById(pageName);
    if (selectedPage) selectedPage.classList.add("active");

    const selectedLink = document.querySelector(
        `.nav-link[data-page="${pageName}"]`
    );

    if (selectedLink) selectedLink.classList.add("active");

    if (pageTitle) {
        pageTitle.textContent = pageNames[pageName] || "Dashboard";
    }

    // Recalculate canvas dimensions when opening the live page.
    if (pageName === "live") {
        requestAnimationFrame(resizeWaveform);
    }
if (pageName === "history") {
    loadHistory();
}

if (pageName === "reports") {
    loadReports();
}

if (pageName === "heatmap") {
    requestAnimationFrame(() => {
        initializeFieldActivityMap();
        if (fieldActivityMap) fieldActivityMap.invalidateSize();
        loadFieldActivity();
    });
}
if (pageName === "iot") {
    loadIotSensor();
}
}

navLinks.forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();
        showPage(link.dataset.page);
    });
});

document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.go);
    });
});


// =====================================
// CROP AND GROWTH STAGE
// =====================================

const cropNames = {
    rice: "Rice Field",
    maize: "Maize Field",
    sugarcane: "Sugarcane Field",
    groundnut: "Groundnut Field",
    wheat: "Wheat Field",
    cotton: "Cotton Field",
    millet: "Millet Field",
    vegetables: "Vegetable Field",
    other: "Other Field"
};

const stageNames = {
    seedling: "Seedling Stage",
    vegetative: "Vegetative Stage",
    flowering: "Flowering Stage",
    "grain-filling": "Grain Filling Stage",
    maturity: "Maturity / Harvest Stage"
};

function updateCropDisplays() {
    const crop = localStorage.getItem("selectedCrop");
    const stage = localStorage.getItem("selectedGrowthStage");

    const cropText = cropNames[crop] || "Not selected";
    const stageText = stageNames[stage] || "Not selected";

    [
        "dashboard-selected-crop",
        "live-selected-crop"
    ].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = cropText;
    });

    [
        "dashboard-selected-stage",
        "live-selected-stage"
    ].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = stageText;
    });
}

const saveCropButton = document.getElementById("save-crop");

if (saveCropButton) {
    saveCropButton.addEventListener("click", () => {
        const cropSelect = document.getElementById("crop-select");
        const stageSelect = document.getElementById("growth-stage");
        const status = document.getElementById("crop-selection-status");

        if (!cropSelect || !stageSelect) return;

        const crop = cropSelect.value;
        const stage = stageSelect.value;

        if (!crop || !stage) {
            if (status) {
                status.textContent =
                    "Please select both crop and growth stage.";
            }
            return;
        }

        localStorage.setItem("selectedCrop", crop);
        localStorage.setItem("selectedGrowthStage", stage);

        updateCropDisplays();

        if (status) {
            status.textContent = "Field selection saved successfully.";
        }
    });
}


// Restore saved crop selection.

const savedCrop = localStorage.getItem("selectedCrop");
const savedStage = localStorage.getItem("selectedGrowthStage");

const cropSelect = document.getElementById("crop-select");
const stageSelect = document.getElementById("growth-stage");

if (cropSelect && savedCrop) cropSelect.value = savedCrop;
if (stageSelect && savedStage) stageSelect.value = savedStage;

updateCropDisplays();


// =====================================
// CONFIDENCE THRESHOLD SETTINGS
// =====================================

const DEFAULT_CONFIDENCE_THRESHOLD = 30;

const confidenceThresholdSelect =
    document.getElementById("confidence-threshold");

const confidenceThresholdStatus =
    document.getElementById("confidence-threshold-status");

function getMinimumConfidence() {
    const saved = Number(
        localStorage.getItem("birdConfidenceThreshold")
    );

    return Number.isFinite(saved) &&
        [10, 30, 50, 70].includes(saved)
        ? saved
        : DEFAULT_CONFIDENCE_THRESHOLD;
}

function updateConfidenceThresholdDisplay() {
    const threshold = getMinimumConfidence();

    if (confidenceThresholdSelect) {
        confidenceThresholdSelect.value = String(threshold);
    }

    if (confidenceThresholdStatus) {
        confidenceThresholdStatus.textContent =
            `Current threshold: ${threshold}%`;
    }
}

if (confidenceThresholdSelect) {
    confidenceThresholdSelect.addEventListener("change", () => {
        const value = Number(confidenceThresholdSelect.value);

        if (![10, 30, 50, 70].includes(value)) return;

        localStorage.setItem(
            "birdConfidenceThreshold",
            String(value)
        );

        updateConfidenceThresholdDisplay();
    });
}

updateConfidenceThresholdDisplay();


// =====================================
// LIVE BIRD DETECTION ELEMENTS
// =====================================

const startButton = document.getElementById("start-listening");
const stopButton = document.getElementById("stop-listening");

const recordingStatus =
    document.getElementById("recording-status");

const audioPreview =
    document.getElementById("audio-preview");

const waveformCanvas =
    document.getElementById("audio-waveform");

const canvasContext = waveformCanvas
    ? waveformCanvas.getContext("2d")
    : null;

let mediaRecorder = null;
let audioStream = null;
let audioChunks = [];

let audioContext = null;
let analyser = null;
let microphoneSource = null;

let recordingLocation = null;
let locationRequestId = 0;

let animationId = null;
let waveformData = null;


// =====================================
// WAVEFORM FUNCTIONS
// =====================================

function resizeWaveform() {
    if (!waveformCanvas || !canvasContext) return;

    const container = waveformCanvas.parentElement;

    const width = container
        ? container.clientWidth - 24
        : waveformCanvas.clientWidth;

    const height = 145;

    if (width <= 0) return;

    const pixelRatio = window.devicePixelRatio || 1;

    waveformCanvas.width = Math.floor(width * pixelRatio);
    waveformCanvas.height = Math.floor(height * pixelRatio);

    waveformCanvas.style.width = "100%";
    waveformCanvas.style.height = height + "px";

    canvasContext.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0
    );
}

function drawWaveform() {
    if (!analyser || !waveformCanvas || !canvasContext) {
        return;
    }

    const width = waveformCanvas.clientWidth;
    const height = waveformCanvas.clientHeight;

    // Retry when the canvas is temporarily hidden or has no dimensions.
    if (width <= 0 || height <= 0) {
        animationId = requestAnimationFrame(drawWaveform);
        return;
    }

    analyser.getByteTimeDomainData(waveformData);

    canvasContext.clearRect(0, 0, width, height);

    // Draw centre guide.
    canvasContext.beginPath();
    canvasContext.strokeStyle = "#cbded1";
    canvasContext.lineWidth = 1;
    canvasContext.moveTo(0, height / 2);
    canvasContext.lineTo(width, height / 2);
    canvasContext.stroke();

    // Draw microphone waveform.
    canvasContext.beginPath();
    canvasContext.strokeStyle = "#16834a";
    canvasContext.lineWidth = 3;

    const sliceWidth = width / waveformData.length;

    for (let i = 0; i < waveformData.length; i++) {
        const value = (waveformData[i] - 128) / 128;
        const y = height / 2 + value * height * 0.4;
        const x = i * sliceWidth;

        if (i === 0) {
            canvasContext.moveTo(x, y);
        } else {
            canvasContext.lineTo(x, y);
        }
    }

    canvasContext.stroke();

    animationId = requestAnimationFrame(drawWaveform);
}

// Stop animation but keep the last waveform visible.
function stopWaveform() {
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}


// =====================================
// DISPLAY BIRDNET RESULTS
// =====================================

function displayBirdnetResults(result) {
    const speciesElement =
        document.getElementById("live-species");

    const confidenceElement =
        document.getElementById("live-confidence");

    const pestElement =
        document.getElementById("live-pest-status");

    const messageElement =
        document.getElementById("detection-message");

    const listElement =
        document.getElementById("live-detection-list");

    const minimumConfidence = getMinimumConfidence() / 100;

    const predictions = Array.isArray(result.predictions)
        ? result.predictions
        : [];

    const filteredPredictions = predictions.filter(prediction =>
        Number.isFinite(Number(prediction.confidence)) &&
        Number(prediction.confidence) >= minimumConfidence &&
        prediction.scientific_name
    );

    // Group predictions by scientific name.
    const groupedSpecies = new Map();

    filteredPredictions.forEach(prediction => {
        const scientificName = prediction.scientific_name;

        if (!groupedSpecies.has(scientificName)) {
            groupedSpecies.set(scientificName, {
                ...prediction,
                segments: [],
                detectionCount: 0
            });
        }

        const group = groupedSpecies.get(scientificName);

        group.segments.push({
            start_time: prediction.start_time,
            end_time: prediction.end_time,
            confidence: Number(prediction.confidence)
        });

        group.detectionCount += 1;

        if (
            Number(prediction.confidence) >
            Number(group.confidence)
        ) {
            group.confidence = Number(prediction.confidence);

            group.crop_assessment =
                prediction.crop_assessment ||
                group.crop_assessment;

            group.common_name =
                prediction.common_name ||
                group.common_name;
        }
    });

    const speciesGroups = Array.from(
        groupedSpecies.values()
    ).sort(
        (a, b) =>
            Number(b.confidence) - Number(a.confidence)
    );

    if (listElement) {
        listElement.replaceChildren();
    }

    if (speciesElement) {
        speciesElement.textContent =
            "No qualifying bird detections";
    }

    if (confidenceElement) {
        confidenceElement.textContent = "--";
    }

    if (pestElement) {
        pestElement.textContent = "Not assessed";
    }

    // No detections above the selected threshold.
    if (speciesGroups.length === 0) {
        if (messageElement) {
            messageElement.textContent =
                `No bird detections met the minimum confidence threshold of ${getMinimumConfidence()}%.`;
        }

        if (listElement) {
            listElement.textContent =
                "Try recording again or choose a lower confidence threshold in Settings.";
        }

        return;
    }

    const best = speciesGroups[0];
    const assessment = best.crop_assessment || {};

    const bestName =
        best.common_name || best.scientific_name;

    if (speciesElement) {
        speciesElement.textContent = bestName;
    }

    if (confidenceElement) {
        confidenceElement.textContent =
            (Number(best.confidence) * 100).toFixed(2) + "%";
    }

    // Crop pest classification.
    let pestLabel = "Unknown";

    if (assessment.classification === "pest") {
        if (assessment.selected_stage_match === true) {
            pestLabel = "Documented pest for selected stage";
        } else if (assessment.selected_stage_match === false) {
            pestLabel =
                "Pest - damage not documented at selected stage";
        } else {
            pestLabel =
                "Pest - growth-stage evidence unavailable";
        }
    } else if (assessment.classification === "non_pest") {
        pestLabel = "Non-pest";
    }

    const risk = assessment.pest_risk_percentage;

    if (pestElement) {
        pestElement.textContent =
            pestLabel +
            " | Risk: " +
            (
                risk === null || risk === undefined
                    ? "Not calculated"
                    : risk + "%"
            );
    }

    const totalSegments = speciesGroups.reduce(
        (total, species) =>
            total + species.detectionCount,
        0
    );

    if (messageElement) {
        messageElement.textContent =
            `${speciesGroups.length} unique species found across ${totalSegments} detection segments. Minimum confidence: ${getMinimumConfidence()}%.`;
    }

    if (!listElement) return;

    // Display each species.
    speciesGroups.forEach(species => {
        const item = document.createElement("div");
        item.className = "detection-item";

        const title = document.createElement("strong");
        title.textContent =
            species.common_name || species.scientific_name;

        item.appendChild(title);

        function addDetail(label, value) {
            const paragraph = document.createElement("p");
            paragraph.textContent = `${label}: ${value}`;
            item.appendChild(paragraph);
        }

        const crop = species.crop_assessment || {};

        addDetail("Scientific name", species.scientific_name);

        addDetail(
            "Highest bird confidence",
            (Number(species.confidence) * 100).toFixed(2) + "%"
        );

        addDetail("Detection segments", species.detectionCount);

        addDetail(
            "Pest classification",
            crop.classification || "Unknown"
        );

        addDetail(
            "Crop impact",
            crop.crop_impact ||
            "No verified crop relationship found in the database."
        );

        addDetail(
            "Damage type",
            Array.isArray(crop.damage_type) &&
            crop.damage_type.length
                ? crop.damage_type.join(", ")
                : "Not documented"
        );

        addDetail(
            "Affected growth stages",
            Array.isArray(crop.affected_growth_stages) &&
            crop.affected_growth_stages.length
                ? crop.affected_growth_stages.join(", ")
                : "Not documented"
        );

        let stageText = "Stage evidence unavailable";

        if (crop.selected_stage_match === true) {
            stageText = "Matches selected growth stage";
        } else if (crop.selected_stage_match === false) {
            stageText =
                "Damage not documented at selected stage";
        }

        addDetail("Stage relevance", stageText);

        addDetail(
            "Pest risk",
            crop.pest_risk_percentage === null ||
            crop.pest_risk_percentage === undefined
                ? "Not calculated"
                : crop.pest_risk_percentage + "%"
        );

        if (
            crop.reported_damage_percent !== null &&
            crop.reported_damage_percent !== undefined
        ) {
            addDetail(
                "Historical reported crop damage",
                crop.reported_damage_percent + "%"
            );
        }

        // Detection times.
        const segmentHeading =
            document.createElement("strong");

        segmentHeading.textContent = "Detection times";
        item.appendChild(segmentHeading);

        species.segments.forEach(segment => {
            addDetail(
                "Time",
                `${Number(segment.start_time).toFixed(1)}-${Number(segment.end_time).toFixed(1)} seconds | ${(segment.confidence * 100).toFixed(2)}%`
            );
        });

        // Evidence sources.
        if (
            Array.isArray(crop.sources) &&
            crop.sources.length
        ) {
            const sourceHeading =
                document.createElement("strong");

            sourceHeading.textContent = "Evidence sources";
            item.appendChild(sourceHeading);

            crop.sources.forEach(source => {
                if (!source.url || !source.title) return;

                const link = document.createElement("a");

                link.href = source.url;
                link.textContent = source.title;
                link.target = "_blank";
                link.rel = "noopener noreferrer";

                item.appendChild(link);
            });
        }

        listElement.appendChild(item);
    });
}


// =====================================
// SEND RECORDING TO BIRDNET API
// =====================================

async function analyseRecording(audioBlob) {
    const selectedCrop =
        localStorage.getItem("selectedCrop");

    const selectedStage =
        localStorage.getItem("selectedGrowthStage");

    if (!selectedCrop || !selectedStage) {
        throw new Error(
            "Please select and save your crop and growth stage first."
        );
    }

    const analysisPanel =
        document.getElementById("analysis-panel");

    const analysisSpinner =
        document.getElementById("analysis-spinner");

    const analysisTitle =
        document.getElementById("analysis-title");

    const analysisDescription =
        document.getElementById("analysis-description");

    const analysisTime =
        document.getElementById("analysis-time");

    const startedAt = Date.now();

    function updateTimer() {
        if (!analysisTime) return;

        const elapsed = Math.floor(
            (Date.now() - startedAt) / 1000
        );

        const minutes = String(
            Math.floor(elapsed / 60)
        ).padStart(2, "0");

        const seconds = String(
            elapsed % 60
        ).padStart(2, "0");

        analysisTime.textContent = `${minutes}:${seconds}`;
    }

    if (analysisPanel) {
        analysisPanel.hidden = false;
        analysisPanel.classList.remove("completed", "failed");
    }

    if (analysisTitle) {
        analysisTitle.textContent = "Analysing recording...";
    }

    if (analysisDescription) {
        analysisDescription.textContent =
            "Uploading audio, identifying bird species and assessing the selected crop.";
    }

    if (analysisSpinner) {
        analysisSpinner.style.display = "block";
    }

    if (recordingStatus) {
        recordingStatus.textContent =
            "Recording stopped. Analysing bird sounds...";
    }

    updateTimer();

    const timerId = window.setInterval(updateTimer, 250);

    try {
        const formData = new FormData();

        formData.append(
            "file",
            audioBlob,
            "bird-recording.webm"
        );

        formData.append("crop_id", selectedCrop);

        formData.append(
            "growth_stage",
            selectedStage.replace(/-/g, "_")
        );

        if (recordingLocation) {
            formData.append("latitude", recordingLocation.latitude);
            formData.append("longitude", recordingLocation.longitude);

            if (recordingLocation.accuracy !== null) {
                formData.append(
                    "location_accuracy",
                    recordingLocation.accuracy
                );
            }
        }

        const response = await fetch(
            "http://127.0.0.1:8001/api/recordings",
            {
                method: "POST",
                body: formData
            }
        );

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error(
                "The server returned an unreadable response."
            );
        }

        if (!response.ok) {
            throw new Error(
                result.detail || "BirdNET analysis failed."
            );
        }

        displayBirdnetResults(result);

        updateTimer();

        if (analysisPanel) {
            analysisPanel.classList.add("completed");
        }

        if (analysisTitle) {
            analysisTitle.textContent =
                "Analysis completed successfully!";
        }

        if (analysisDescription) {
            analysisDescription.textContent =
                "Bird identification and crop assessment are complete.";
        }

        if (analysisSpinner) {
            analysisSpinner.style.display = "none";
        }

        if (recordingStatus) {
            recordingStatus.textContent =
                "Bird detection and crop assessment completed successfully.";
        }

        // Debug information.
        console.log("========== BIRD GUARD AI DEBUG ==========");
        console.log("FULL API RESPONSE:");
        console.log(JSON.stringify(result, null, 2));

        console.log("Bird detected:", result.bird_detected);
        console.log("Bird count:", result.bird_count);
        console.log("Predictions:", result.predictions);

        if (Array.isArray(result.predictions)) {
            result.predictions.forEach((bird, index) => {
                console.log(`Bird ${index + 1}:`, {
                    common_name: bird.common_name,
                    scientific_name: bird.scientific_name,
                    confidence: bird.confidence,
                    crop_assessment: bird.crop_assessment
                });
            });
        }

        console.log("========== END DEBUG ==========");

        return result;

    } catch (error) {
        if (analysisPanel) {
            analysisPanel.classList.add("failed");
        }

        if (analysisTitle) {
            analysisTitle.textContent = "Analysis failed";
        }

        if (analysisDescription) {
            analysisDescription.textContent = error.message;
        }

        if (analysisSpinner) {
            analysisSpinner.style.display = "none";
        }

        if (recordingStatus) {
            recordingStatus.textContent =
                "Analysis failed: " + error.message;
        }

        throw error;

    } finally {
        window.clearInterval(timerId);
        updateTimer();
    }
}


// =====================================
// START MICROPHONE
// =====================================

async function startListening() {
    try {
        recordingLocation = null;
        const thisLocationRequestId = ++locationRequestId;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    if (thisLocationRequestId !== locationRequestId) return;

                    recordingLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: Number.isFinite(position.coords.accuracy)
                            ? position.coords.accuracy
                            : null
                    };
                },
                error => {
                    if (thisLocationRequestId === locationRequestId) {
                        console.info("Recording location unavailable:", error.message);
                    }
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            );
        }

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error(
                "Open the application using localhost or HTTPS."
            );
        }

        if (startButton) startButton.disabled = true;
        if (stopButton) stopButton.disabled = true;

        if (recordingStatus) {
            recordingStatus.textContent =
                "Requesting microphone permission...";
        }

        audioStream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            throw new Error(
                "Web Audio API is not supported."
            );
        }

        audioContext = new AudioContextClass();

        await audioContext.resume();

        analyser = audioContext.createAnalyser();

        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.75;

        microphoneSource =
            audioContext.createMediaStreamSource(audioStream);

        microphoneSource.connect(analyser);

        waveformData = new Uint8Array(analyser.fftSize);

        // Start waveform after the browser updates the layout.
        stopWaveform();

        requestAnimationFrame(() => {
            resizeWaveform();
            drawWaveform();
        });

        audioChunks = [];

        // Hide previous analysis result.
        const analysisPanel =
            document.getElementById("analysis-panel");

        if (analysisPanel) {
            analysisPanel.hidden = true;
            analysisPanel.classList.remove("completed", "failed");
        }

        if (audioPreview) {
            audioPreview.hidden = true;
            audioPreview.removeAttribute("src");
        }

        const options = {};

        if (
            window.MediaRecorder &&
            MediaRecorder.isTypeSupported(
                "audio/webm;codecs=opus"
            )
        ) {
            options.mimeType = "audio/webm;codecs=opus";
        }

        if (!window.MediaRecorder) {
            throw new Error(
                "MediaRecorder is not supported in this browser."
            );
        }

        mediaRecorder = new MediaRecorder(audioStream, options);

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, {
                type: mediaRecorder.mimeType || "audio/webm"
            });

            // Show audio preview.
            if (audioPreview) {
                const audioURL = URL.createObjectURL(audioBlob);
                audioPreview.src = audioURL;
                audioPreview.hidden = false;
            }

            // Stop waveform animation and retain its last frame.
            stopWaveform();

            // Stop microphone tracks.
            if (audioStream) {
                audioStream
                    .getTracks()
                    .forEach(track => track.stop());

                audioStream = null;
            }

            // Close audio context.
            if (audioContext) {
                await audioContext.close();

                audioContext = null;
                analyser = null;
                microphoneSource = null;
            }

            // Send recording to backend.
            try {
                await analyseRecording(audioBlob);

            } catch (error) {
                console.error(
                    "BirdNET analysis error:",
                    error
                );

                if (recordingStatus) {
                    recordingStatus.textContent =
                        "Analysis failed: " + error.message;
                }
            }
        };

        mediaRecorder.start();

        if (stopButton) stopButton.disabled = false;

        if (recordingStatus) {
            recordingStatus.textContent =
                "Listening... Click Stop Listening to analyse the recording.";
        }

    } catch (error) {
        console.error("Microphone error:", error);

        if (recordingStatus) {
            recordingStatus.textContent =
                "Microphone error: " + error.message;
        }

        if (startButton) startButton.disabled = false;
        if (stopButton) stopButton.disabled = true;

        stopWaveform();

        if (audioStream) {
            audioStream
                .getTracks()
                .forEach(track => track.stop());

            audioStream = null;
        }

        if (audioContext) {
            await audioContext.close();

            audioContext = null;
            analyser = null;
            microphoneSource = null;
        }
    }
}


// =====================================
// STOP MICROPHONE
// =====================================

function stopListening() {
    if (
        mediaRecorder &&
        mediaRecorder.state === "recording"
    ) {
        if (stopButton) stopButton.disabled = true;
        if (startButton) startButton.disabled = false;

        if (recordingStatus) {
            recordingStatus.textContent =
                "Recording stopped. Preparing BirdNET analysis...";
        }

        mediaRecorder.stop();
    }
}


// =====================================
// BUTTON EVENTS
// =====================================

if (startButton) {
    startButton.addEventListener("click", startListening);
}

if (stopButton) {
    stopButton.addEventListener("click", stopListening);
}

window.addEventListener("resize", () => {
    resizeWaveform();
});


// =====================================
// INITIALIZATION
// =====================================

updateCropDisplays();
updateConfidenceThresholdDisplay();

console.log("Bird Guard AI frontend loaded.");
console.log("Microphone recording and BirdNET API integration ready.");

// =============================================
// BIRD GUARD AI - DETECTION HISTORY
// =============================================

const HISTORY_API = "http://127.0.0.1:8001";

let historyRecords = [];

const historyList = document.getElementById("history-list");
const historyStatus = document.getElementById("history-status");

const historySearch = document.getElementById("history-search");
const historyCropFilter = document.getElementById("history-crop-filter");
const refreshHistoryButton = document.getElementById("refresh-history");


// Convert values such as grain_filling into readable labels.

function historyLabel(value) {
    if (!value) return "Unknown";

    return String(value)
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, letter => letter.toUpperCase());
}


// Format recording date and time.

function historyDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return date.toLocaleString();
}


// Fetch records from FastAPI.

async function loadHistory() {

    if (!historyList || !historyStatus) return;

    historyStatus.textContent = "Loading detection history...";

    try {

        const response = await fetch(
            `${HISTORY_API}/api/history?limit=100`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.detail || "Could not load history."
            );
        }

        historyRecords = Array.isArray(result.records)
            ? result.records
            : [];

        renderHistory();

    } catch (error) {

        console.error("History loading error:", error);

        historyStatus.textContent =
            "Unable to load history: " + error.message;

        historyList.replaceChildren();
    }
}


// Render history records.

function renderHistory() {

    if (!historyList) return;

    historyList.replaceChildren();

    const searchText = historySearch
        ? historySearch.value.trim().toLowerCase()
        : "";

    const selectedCrop = historyCropFilter
        ? historyCropFilter.value
        : "all";

    const filteredRecords = historyRecords.filter(record => {

        const cropMatches =
            selectedCrop === "all" ||
            record.selected_crop === selectedCrop;

        const predictions = Array.isArray(record.predictions)
            ? record.predictions
            : [];

        const searchMatches =
            !searchText ||
            predictions.some(prediction => {

                const commonName =
                    prediction.common_name || "";

                const scientificName =
                    prediction.scientific_name || "";

                return (
                    commonName.toLowerCase().includes(searchText) ||
                    scientificName.toLowerCase().includes(searchText)
                );
            });

        return cropMatches && searchMatches;
    });


    if (filteredRecords.length === 0) {

        historyStatus.textContent =
            historyRecords.length === 0
                ? "No saved recordings yet."
                : "No records match your search or crop filter.";

        const empty = document.createElement("div");

        empty.className = "history-empty";

        empty.textContent =
            "No matching detection records found.";

        historyList.appendChild(empty);

        return;
    }


    historyStatus.textContent =
        `${filteredRecords.length} recording(s) displayed. ` +
        "Showing the latest saved records.";


    filteredRecords.forEach(record => {

        const predictions = Array.isArray(record.predictions)
            ? record.predictions
            : [];

        const card = document.createElement("article");

        card.className = "history-card";


        // Find highest-confidence prediction.

        const bestPrediction = predictions.length
            ? predictions.reduce((best, current) =>
                Number(current.confidence) >
                Number(best.confidence)
                    ? current
                    : best
            )
            : null;


        const title = document.createElement("h3");

        title.textContent = bestPrediction
            ? (
                bestPrediction.common_name ||
                bestPrediction.scientific_name
            )
            : "No verified bird detections";


        const date = document.createElement("p");

        date.textContent = historyDate(record.created_at);


        const header = document.createElement("div");

        header.className = "history-card-header";

        const headingGroup = document.createElement("div");

        headingGroup.append(title, date);

        const badge = document.createElement("span");

        badge.className = "history-status-badge";

        badge.textContent = record.bird_detected
            ? "Bird detected"
            : "No bird detected";

        header.append(headingGroup, badge);

        card.appendChild(header);


        // Recording metadata.

        const metadata = document.createElement("div");

        metadata.className = "history-meta";

        function addMetadata(label, value) {

            const item = document.createElement("div");

            item.className = "history-meta-item";

            const labelElement = document.createElement("span");

            labelElement.textContent = label;

            const valueElement = document.createElement("strong");

            valueElement.textContent = value;

            item.append(labelElement, valueElement);

            metadata.appendChild(item);
        }


        addMetadata(
            "Selected Crop",
            historyLabel(record.selected_crop)
        );

        addMetadata(
            "Growth Stage",
            historyLabel(record.growth_stage)
        );

        addMetadata(
            "Detection Segments",
            String(record.detection_segments)
        );

        addMetadata(
            "Unique Species",
            String(
                new Set(
                    predictions.map(item => item.scientific_name)
                ).size
            )
        );

        if (bestPrediction) {

            addMetadata(
                "Highest Confidence",
                (
                    Number(bestPrediction.confidence) * 100
                ).toFixed(2) + "%"
            );
        }

        card.appendChild(metadata);


        // Expandable analysis details.

        const details = document.createElement("details");

        const summary = document.createElement("summary");

        summary.textContent = "View full analysis";

        details.appendChild(summary);


        if (predictions.length === 0) {

            const emptyText = document.createElement("p");

            emptyText.textContent =
                "No verified bird species were identified in this recording.";

            details.appendChild(emptyText);
        }


        predictions.forEach(prediction => {

            const predictionCard =
                document.createElement("div");

            predictionCard.className = "history-prediction";

            const name = document.createElement("strong");

            name.textContent =
                prediction.common_name ||
                prediction.scientific_name ||
                "Unknown species";

            predictionCard.appendChild(name);


            function addPredictionDetail(label, value) {

                const paragraph = document.createElement("p");

                paragraph.textContent =
                    `${label}: ${value}`;

                predictionCard.appendChild(paragraph);
            }


            addPredictionDetail(
                "Scientific name",
                prediction.scientific_name || "Unknown"
            );

            addPredictionDetail(
                "Confidence",
                (
                    Number(prediction.confidence) * 100
                ).toFixed(2) + "%"
            );

            addPredictionDetail(
                "Detection time",
                `${Number(prediction.start_time).toFixed(1)}-` +
                `${Number(prediction.end_time).toFixed(1)} seconds`
            );


            const assessment = prediction.crop_assessment || {};

            addPredictionDetail(
                "Pest classification",
                assessment.classification || "Unknown"
            );

            addPredictionDetail(
                "Crop impact",
                assessment.crop_impact || "Not documented"
            );

            addPredictionDetail(
                "Stage relevance",
                assessment.selected_stage_match === true
                    ? "Matches selected stage"
                    : assessment.selected_stage_match === false
                        ? "Not documented at selected stage"
                        : "Evidence unavailable"
            );

            addPredictionDetail(
                "Pest risk",
                assessment.pest_risk_percentage == null
                    ? "Not calculated"
                    : assessment.pest_risk_percentage + "%"
            );

            predictionCard.appendChild(document.createElement("hr"));

            details.appendChild(predictionCard);
        });


        card.appendChild(details);


        // Play original recording.

        const audio = document.createElement("audio");

        audio.className = "history-audio";

        audio.controls = true;

        audio.preload = "none";

        audio.src = HISTORY_API + record.audio_url;

        card.appendChild(audio);


        // Delete individual history record.

        const deleteButton = document.createElement("button");

        deleteButton.type = "button";

        deleteButton.className =
            "danger-button history-delete";

        deleteButton.textContent = "Delete Record";

        deleteButton.addEventListener("click", async () => {

            const confirmed = window.confirm(
                "Delete this history record and its saved audio?"
            );

            if (!confirmed) return;

            await deleteHistoryRecord(record.recording_id);
        });


        card.appendChild(deleteButton);

        historyList.appendChild(card);

    });
}


// Delete a history record.

async function deleteHistoryRecord(recordingId) {

    try {

        const response = await fetch(
            `${HISTORY_API}/api/history/${encodeURIComponent(recordingId)}`,
            {
                method: "DELETE"
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.detail || "Could not delete record."
            );
        }

        await loadHistory();

    } catch (error) {

        console.error("History deletion error:", error);

        if (historyStatus) {
            historyStatus.textContent =
                "Delete failed: " + error.message;
        }
    }
}


// Search and crop filtering.

if (historySearch) {
    historySearch.addEventListener(
        "input",
        renderHistory
    );
}

if (historyCropFilter) {
    historyCropFilter.addEventListener(
        "change",
        renderHistory
    );
}

if (refreshHistoryButton) {
    refreshHistoryButton.addEventListener(
        "click",
        loadHistory
    );
}


console.log("Bird Guard AI detection history ready.");


// ==================================================
// BIRD GUARD AI - REPORTS AND ANALYTICS
// ==================================================

let reportRecords = [];

const reportsStatus = document.getElementById("reports-status");
const refreshReportsButton = document.getElementById("refresh-reports");


// --------------------------------------------------
// LOAD REPORT DATA FROM FASTAPI
// --------------------------------------------------

async function loadReports() {

    if (!document.getElementById("reports")) return;

    if (reportsStatus) {
        reportsStatus.textContent = "Loading analytics...";
    }

    try {

        const response = await fetch(
            `${HISTORY_API}/api/history?limit=100`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.detail || "Unable to load analytics."
            );
        }

        reportRecords = Array.isArray(result.records)
            ? result.records
            : [];

        renderReports();

    } catch (error) {

        console.error("Reports loading error:", error);

        if (reportsStatus) {
            reportsStatus.textContent =
                "Unable to load reports: " + error.message;
        }
    }
}


// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function reportNumber(value) {

    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
}


function reportSpeciesKey(prediction) {

    return (
        prediction.scientific_name ||
        prediction.species_name ||
        prediction.common_name ||
        "Unknown species"
    );
}


function reportSpeciesName(prediction) {

    return (
        prediction.common_name ||
        prediction.scientific_name ||
        "Unknown species"
    );
}


function reportElement(id) {

    return document.getElementById(id);
}


function setReportValue(id, value) {

    const element = reportElement(id);

    if (element) {
        element.textContent = String(value);
    }
}


// --------------------------------------------------
// REUSABLE BAR CHART
// --------------------------------------------------

function renderReportBars(
    containerId,
    entries,
    emptyMessage = "No data available."
) {

    const container = reportElement(containerId);

    if (!container) return;

    container.replaceChildren();

    if (!entries.length) {

        const empty = document.createElement("p");

        empty.className = "report-empty";
        empty.textContent = emptyMessage;

        container.appendChild(empty);

        return;
    }

    const maximum = Math.max(
        1,
        ...entries.map(item => item.value)
    );

    entries.forEach(item => {

        const row = document.createElement("div");
        row.className = "report-bar-row";

        const label = document.createElement("div");
        label.className = "report-bar-label";

        const name = document.createElement("span");
        name.textContent = item.label;

        const value = document.createElement("strong");
        value.textContent = String(item.value);

        label.append(name, value);

        const track = document.createElement("div");
        track.className = "report-bar-track";

        const fill = document.createElement("div");
        fill.className = "report-bar-fill";

        fill.style.width =
            `${(item.value / maximum) * 100}%`;

        track.appendChild(fill);

        row.append(label, track);

        container.appendChild(row);
    });
}


// --------------------------------------------------
// MAIN ANALYTICS CALCULATION
// --------------------------------------------------

function renderReports() {

    const records = reportRecords;

    const totalRecordings = records.length;

    let detectedRecordings = 0;
    let noDetectionRecordings = 0;
    let totalSegments = 0;

    const uniqueSpecies = new Set();

    const cropCounts = {};
    const speciesCounts = {};
    const activityCounts = {};

    // Process every saved recording.

    records.forEach(record => {

        const predictions = Array.isArray(record.predictions)
            ? record.predictions
            : [];

        const hasDetections =
            record.bird_detected === true ||
            predictions.length > 0;

        if (hasDetections) {
            detectedRecordings++;
        } else {
            noDetectionRecordings++;
        }

        // Detection segment count.
        const segments = record.detection_segments != null
            ? reportNumber(record.detection_segments)
            : predictions.length;

        totalSegments += segments;

        // Crop-wise recording count.
        const crop = historyLabel(record.selected_crop);

        cropCounts[crop] = (cropCounts[crop] || 0) + 1;

        // Species statistics.
        predictions.forEach(prediction => {

            const speciesKey = reportSpeciesKey(prediction);

            const speciesName = reportSpeciesName(prediction);

            uniqueSpecies.add(speciesKey);

            if (!speciesCounts[speciesKey]) {

                speciesCounts[speciesKey] = {
                    label: speciesName,
                    value: 0
                };
            }

            // Count detection segments, not individual birds.
            speciesCounts[speciesKey].value++;
        });

        // Recording activity by date.
        if (record.created_at) {

            const date = new Date(record.created_at);

            if (!Number.isNaN(date.getTime())) {

                const dateKey = [
                    date.getFullYear(),
                    String(date.getMonth() + 1).padStart(2, "0"),
                    String(date.getDate()).padStart(2, "0")
                ].join("-");

                activityCounts[dateKey] =
                    (activityCounts[dateKey] || 0) + 1;
            }
        }
    });


    // --------------------------------------------------
    // UPDATE SUMMARY CARDS
    // --------------------------------------------------

    setReportValue(
        "report-total-recordings",
        totalRecordings
    );

    setReportValue(
        "report-detected-recordings",
        detectedRecordings
    );

    setReportValue(
        "report-unique-species",
        uniqueSpecies.size
    );

    setReportValue(
        "report-total-segments",
        totalSegments
    );


    // --------------------------------------------------
    // CROP-WISE RECORDINGS
    // --------------------------------------------------

    const cropEntries = Object.entries(cropCounts)
        .map(([label, value]) => ({
            label,
            value
        }))
        .sort((a, b) => b.value - a.value);

    renderReportBars(
        "report-crop-chart",
        cropEntries,
        "No crop recording data available."
    );


    // --------------------------------------------------
    // DETECTION SUMMARY
    // --------------------------------------------------

    renderReportBars(
        "report-detection-chart",
        [
            {
                label: "Bird detected",
                value: detectedRecordings
            },
            {
                label: "No bird detected",
                value: noDetectionRecordings
            }
        ]
    );


    // --------------------------------------------------
    // MOST FREQUENTLY DETECTED SPECIES
    // --------------------------------------------------

    const speciesEntries = Object.values(speciesCounts)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

    renderReportBars(
        "report-species-chart",
        speciesEntries,
        "No bird species detected yet."
    );


    // --------------------------------------------------
    // RECORDING ACTIVITY
    // --------------------------------------------------

    const activityEntries = Object.entries(activityCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-7)
        .map(([date, value]) => {

            const formattedDate = new Date(
                date + "T00:00:00"
            ).toLocaleDateString();

            return {
                label: formattedDate,
                value
            };
        });

    renderReportBars(
        "report-activity-chart",
        activityEntries,
        "No recording activity available."
    );


    // --------------------------------------------------
    // RECENT RECORDINGS TABLE
    // --------------------------------------------------

    renderReportsTable(records);


    // --------------------------------------------------
    // STATUS MESSAGE
    // --------------------------------------------------

    if (reportsStatus) {

        reportsStatus.textContent =
            `Analytics updated successfully. ` +
            `Showing ${totalRecordings} saved recording(s) ` +
            `from the latest 100 records.`;
    }

}


// --------------------------------------------------
// RECENT RECORDINGS TABLE
// --------------------------------------------------

function renderReportsTable(records) {

    const tableBody = reportElement(
        "report-records-table"
    );

    if (!tableBody) return;

    tableBody.replaceChildren();

    if (!records.length) {

        const row = document.createElement("tr");

        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.textContent = "No saved recordings available.";

        row.appendChild(cell);
        tableBody.appendChild(row);

        return;
    }

    records.forEach(record => {

        const row = document.createElement("tr");

        const predictions = Array.isArray(record.predictions)
            ? record.predictions
            : [];

        const hasDetections =
            record.bird_detected === true ||
            predictions.length > 0;

        const values = [

            historyDate(record.created_at),

            historyLabel(record.selected_crop),

            historyLabel(record.growth_stage),

            hasDetections
                ? "Bird detected"
                : "No bird detected",

            record.detection_segments != null
                ? recordNumberForTable(record.detection_segments)
                : predictions.length

        ];

        values.forEach(value => {

            const cell = document.createElement("td");

            cell.textContent = String(value);

            row.appendChild(cell);
        });

        tableBody.appendChild(row);
    });

}


function recordNumberForTable(value) {

    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
}


// --------------------------------------------------
// REFRESH REPORTS BUTTON
// --------------------------------------------------

if (refreshReportsButton) {

    refreshReportsButton.addEventListener(
        "click",
        loadReports
    );
}


console.log("Bird Guard AI Reports & Analytics ready.");


// ==================================================
// BIRD GUARD AI - FIELD ACTIVITY HEATMAP
// ==================================================

let fieldActivityMap = null;
let fieldActivityMarkers = null;
let fieldActivityHeat = null;
let fieldActivityRecords = [];

const heatmapStatus = document.getElementById("heatmap-status");
const heatmapCropFilter = document.getElementById("heatmap-crop-filter");
const refreshHeatmapButton = document.getElementById("refresh-heatmap");


function initializeFieldActivityMap() {
    const mapElement = document.getElementById("field-activity-map");

    if (!mapElement || fieldActivityMap) return;

    if (!window.L) {
        if (heatmapStatus) {
            heatmapStatus.textContent =
                "Map library could not be loaded. Check your internet connection and refresh.";
        }
        return;
    }

    fieldActivityMap = L.map(mapElement).setView([22.5, 79], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(fieldActivityMap);

    fieldActivityMarkers = L.layerGroup().addTo(fieldActivityMap);

    if (typeof L.heatLayer === "function") {
        fieldActivityHeat = L.heatLayer([], {
            radius: 28,
            blur: 20,
            maxZoom: 12
        }).addTo(fieldActivityMap);
    }
}


function hasValidCoordinates(record) {
    if (
        record.latitude == null ||
        record.longitude == null ||
        record.latitude === "" ||
        record.longitude === ""
    ) {
        return false;
    }

    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);

    return Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180;
}


function updateHeatmapStats(records) {
    const mapped = records.filter(hasValidCoordinates);
    const detected = records.filter(record =>
        record.bird_detected === true ||
        (Array.isArray(record.predictions) && record.predictions.length > 0)
    );
    const segments = records.reduce((total, record) => {
        const count = Number(record.detection_segments);
        return total + (Number.isFinite(count) && count > 0 ? count : 0);
    }, 0);

    document.getElementById("heatmap-mapped-recordings").textContent = mapped.length;
    document.getElementById("heatmap-detected-recordings").textContent = detected.length;
    document.getElementById("heatmap-detection-segments").textContent = segments;
    document.getElementById("heatmap-unmapped-recordings").textContent =
        records.length - mapped.length;
}


function createFieldActivityPopup(record) {
    const popup = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = historyDate(record.created_at);
    popup.appendChild(heading);

    const details = [
        ["Crop", historyLabel(record.selected_crop)],
        ["Growth stage", historyLabel(record.growth_stage)],
        ["Bird detected", record.bird_detected ? "Yes" : "No"],
        ["Detection segments", String(record.detection_segments ?? 0)]
    ];

    if (record.location_accuracy != null) {
        details.push(["Location accuracy", `${Number(record.location_accuracy).toFixed(0)} m`]);
    }

    details.forEach(([label, value]) => {
        const line = document.createElement("p");
        line.textContent = `${label}: ${value}`;
        popup.appendChild(line);
    });

    return popup;
}


function renderFieldActivity() {
    if (!fieldActivityMap || !fieldActivityMarkers) return;

    const selectedCrop = heatmapCropFilter ? heatmapCropFilter.value : "all";
    const records = fieldActivityRecords.filter(record =>
        selectedCrop === "all" || record.selected_crop === selectedCrop
    );
    const mapped = records.filter(hasValidCoordinates);

    updateHeatmapStats(records);
    fieldActivityMarkers.clearLayers();

    mapped.forEach(record => {
        L.marker([Number(record.latitude), Number(record.longitude)])
            .bindPopup(createFieldActivityPopup(record))
            .addTo(fieldActivityMarkers);
    });

    if (fieldActivityHeat) {
        const points = mapped
            .filter(record => {
                const segmentCount = Number(record.detection_segments);
                return record.bird_detected && Number.isFinite(segmentCount) && segmentCount > 0;
            })
            .map(record => [
                Number(record.latitude),
                Number(record.longitude),
                Number(record.detection_segments)
            ]);

        const maxSegments = Math.max(1, ...points.map(point => point[2]));
        fieldActivityHeat.setOptions({ max: maxSegments });
        fieldActivityHeat.setLatLngs(points);
    }

    if (mapped.length) {
        const bounds = L.latLngBounds(
            mapped.map(record => [Number(record.latitude), Number(record.longitude)])
        );
        fieldActivityMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    } else {
        fieldActivityMap.setView([22.5, 79], 5);
    }

    if (heatmapStatus) {
        heatmapStatus.textContent = mapped.length
            ? `${mapped.length} mapped recording(s) shown. Heat intensity represents detection segments only.`
            : "No GPS locations are available for this crop. Showing the default India view.";
    }
}


async function loadFieldActivity() {
    if (!fieldActivityMap) return;

    if (heatmapStatus) heatmapStatus.textContent = "Loading field activity...";

    try {
        const response = await fetch(`${HISTORY_API}/api/field-activity?limit=500`);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || "Unable to load field activity.");
        }

        fieldActivityRecords = Array.isArray(result.records) ? result.records : [];
        renderFieldActivity();
    } catch (error) {
        console.error("Field activity loading error:", error);
        if (heatmapStatus) {
            heatmapStatus.textContent = "Unable to load field activity: " + error.message;
        }
    }
}


if (heatmapCropFilter) {
    heatmapCropFilter.addEventListener("change", renderFieldActivity);
}

if (refreshHeatmapButton) {
    refreshHeatmapButton.addEventListener("click", loadFieldActivity);
}

console.log("Bird Guard AI Field Activity Heatmap ready.");

/* =========================================
   BIRD GUARD AI - IOT SENSOR MONITORING
========================================= */

const IOT_API_URL = "http://127.0.0.1:8002/api/iot/sensor";

let iotReadings = [];
let iotPollingTimer = null;

async function loadIotSensor() {
    const backendStatus = document.getElementById("iot-backend-status");
    const soundLevel = document.getElementById("iot-sound-level");
    const activityStatus = document.getElementById("iot-activity-status");
    const sensorStatus = document.getElementById("iot-sensor-status");
    const lastReading = document.getElementById("iot-last-reading");

    try {
        const response = await fetch(IOT_API_URL, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("API request failed");
        }

        const result = await response.json();

        backendStatus.textContent = "Online";

        const reading = result.data;

        if (!reading) {
            soundLevel.textContent = "--";
            activityStatus.textContent = "Waiting";
            sensorStatus.textContent = "No data";
            lastReading.textContent =
                "Backend is available. Waiting for sensor readings.";

            drawIotChart();
            return;
        }

        const level = Number(reading.sound_level);
        const threshold = Number(reading.threshold);

        if (!Number.isFinite(level) || !Number.isFinite(threshold)) {
            throw new Error("Invalid sensor reading");
        }

        soundLevel.textContent = level;
        activityStatus.textContent = reading.status;
        
        const readingTime = new Date(reading.timestamp);
        const ageSeconds = (Date.now() - readingTime.getTime()) / 1000;

        if (Number.isFinite(ageSeconds) && ageSeconds >= 0 && ageSeconds <= 10) {
            sensorStatus.textContent = "Recent data";
        } else {
            sensorStatus.textContent = "Stale data";
        }

        lastReading.textContent =
            "Last reading: " + readingTime.toLocaleString();

        if (
            iotReadings.length === 0 ||
            iotReadings[iotReadings.length - 1].timestamp !== reading.timestamp
        ) {
            iotReadings.push({
                level,
                threshold,
                status: reading.status,
                timestamp: reading.timestamp
            });

            if (iotReadings.length > 30) {
                iotReadings.shift();
            }

            renderIotHistory();
        }

        drawIotChart();

    } catch (error) {
        backendStatus.textContent = "Offline";
        sensorStatus.textContent = "Unavailable";
        lastReading.textContent =
            "Cannot reach the IoT API. Check that FastAPI is running.";
    }
}

function renderIotHistory() {
    const history = document.getElementById("iot-reading-history");

    history.innerHTML = "";

    [...iotReadings].reverse().forEach(reading => {
        const row = document.createElement("tr");

        const time = new Date(reading.timestamp).toLocaleTimeString();

        [
            time,
            reading.level,
            reading.threshold,
            reading.status
        ].forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        history.appendChild(row);
    });
}

function drawIotChart() {
    const canvas = document.getElementById("iot-sound-chart");

    if (!canvas) return;

    const context = canvas.getContext("2d");
    const width = canvas.clientWidth || 600;
    const height = 220;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = "100%";
    canvas.style.height = height + "px";

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    context.font = "12px Arial";
    context.fillStyle = "#64748b";

    if (iotReadings.length === 0) {
        context.fillText("Waiting for sensor readings...", 15, 35);
        return;
    }

    const maxValue = Math.max(
        100,
        ...iotReadings.map(item => item.level),
        ...iotReadings.map(item => item.threshold)
    );

    const left = 35;
    const right = width - 15;
    const top = 20;
    const bottom = height - 30;

    context.strokeStyle = "#cbd5e1";
    context.beginPath();
    context.moveTo(left, top);
    context.lineTo(left, bottom);
    context.lineTo(right, bottom);
    context.stroke();

    function yPosition(value) {
        return bottom - (value / maxValue) * (bottom - top);
    }

    const threshold = iotReadings[iotReadings.length - 1].threshold;

    context.setLineDash([5, 4]);
    context.strokeStyle = "#d97706";
    context.beginPath();
    context.moveTo(left, yPosition(threshold));
    context.lineTo(right, yPosition(threshold));
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "#d97706";
    context.fillText("Threshold: " + threshold, left + 5, top + 12);

    context.strokeStyle = "#2563eb";
    context.lineWidth = 2;
    context.beginPath();

    iotReadings.forEach((item, index) => {
        const x = left + (
            iotReadings.length === 1
                ? (right - left) / 2
                : index * (right - left) / (iotReadings.length - 1)
        );

        const y = yPosition(item.level);

        if (index === 0) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }
    });

    context.stroke();
    context.lineWidth = 1;
}

const iotRefreshButton =
    document.getElementById("iot-refresh-button");

if (iotRefreshButton) {
    iotRefreshButton.addEventListener("click", loadIotSensor);
}

if (!iotPollingTimer) {
    iotPollingTimer = setInterval(() => {
        const iotPage = document.getElementById("iot");

        if (iotPage && iotPage.classList.contains("active")) {
            loadIotSensor();
        }
    }, 3000);
}

window.addEventListener("resize", () => {
    const iotPage = document.getElementById("iot");

    if (iotPage && iotPage.classList.contains("active")) {
        drawIotChart();
    }
});
