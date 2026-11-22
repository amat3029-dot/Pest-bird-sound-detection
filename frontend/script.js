
// =====================================
// BIRD GUARD AI - FRONTEND JAVASCRIPT
// =====================================

const API_BASE_URL = (
    window.BIRD_GUARD_API_BASE_URL ||
    document.querySelector('meta[name="bird-guard-api-base-url"]')?.content ||
    (window.location.port === "8010"
        ? window.location.origin
        : "http://127.0.0.1:8010")
).replace(/\/+$/, "");

// =====================================
// PAGE NAVIGATION
// =====================================

const navLinks = document.querySelectorAll(".nav-link");
const pages = document.querySelectorAll(".page");
const pageTitle = document.getElementById("page-title");
const primaryNavigation = document.getElementById("primary-navigation");
const navToggle = document.getElementById("nav-toggle");
const brandLink = document.querySelector(".brand");

function closeMobileNavigation() {
    if (!primaryNavigation || !navToggle) return;

    primaryNavigation.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open navigation");
}

const pageNames = {
    dashboard: "Agricultural Intelligence Dashboard",
    live: "Live Bird Detection",
    monitoring: "Crop Monitor",
    history: "Detection History",
    reports: "Reports & Analytics",
    heatmap: "Field Activity Heatmap",
    iot: "IoT Sensor Monitoring",
    settings: "Settings"
};

function showPage(pageName) {
    closeMobileNavigation();
    pages.forEach(page => page.classList.remove("active"));
    navLinks.forEach(link => {
        link.classList.remove("active");
        link.removeAttribute("aria-current");
    });

    const selectedPage = document.getElementById(pageName);
    if (selectedPage) selectedPage.classList.add("active");

    const selectedLink = document.querySelector(
        `.nav-link[data-page="${pageName}"]`
    );

    if (selectedLink) {
        selectedLink.classList.add("active");
        selectedLink.setAttribute("aria-current", "page");
    }

    if (pageTitle) {
        pageTitle.textContent = pageNames[pageName] || "Dashboard";
    }

    if (pageName === "dashboard") {
        loadDashboardMetrics();
    }

    // Recalculate canvas dimensions when opening the live page.
    if (pageName === "live") {
        requestAnimationFrame(resizeWaveform);
        loadIotSensor();
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
if (pageName === "monitoring") {
    loadCropEvidence();
}
}

if (navToggle && primaryNavigation) {
    navToggle.addEventListener("click", () => {
        const isOpen = primaryNavigation.classList.toggle("is-open");
        navToggle.setAttribute("aria-expanded", String(isOpen));
        navToggle.setAttribute(
            "aria-label",
            isOpen ? "Close navigation" : "Open navigation"
        );
    });
}

if (brandLink) {
    brandLink.addEventListener("click", event => {
        event.preventDefault();
        showPage("dashboard");
    });
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMobileNavigation();
});

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
    const stageText = stageNames[String(stage || "").replace(/_/g, "-")] || "Not selected";

    [
        "dashboard-selected-crop",
        "live-selected-crop",
        "crop-monitor-selected-crop"
    ].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = cropText;
    });

    [
        "dashboard-selected-stage",
        "live-selected-stage",
        "crop-monitor-selected-stage"
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
        syncCropMonitorSelection();

        if (status) {
            status.textContent = "Field selection saved successfully.";
        }
        loadCropEvidence();
        loadDashboardMetrics();
    });
}


// Restore saved crop selection.

const savedCrop = localStorage.getItem("selectedCrop");
const savedStage = localStorage.getItem("selectedGrowthStage");

const cropSelect = document.getElementById("crop-select");
const stageSelect = document.getElementById("growth-stage");

if (cropSelect && savedCrop) {
    const savedCropIsSupported = Array.from(cropSelect.options)
        .some(option => option.value === savedCrop);
    if (savedCropIsSupported) {
        cropSelect.value = savedCrop;
    } else {
        localStorage.removeItem("selectedCrop");
    }
}
if (stageSelect && savedStage) stageSelect.value = savedStage;

updateCropDisplays();


// =====================================
// CONFIDENCE THRESHOLD SETTINGS
// =====================================

const DEFAULT_CONFIDENCE_THRESHOLD = 80;

const confidenceThresholdSelect =
    document.getElementById("confidence-threshold");

const confidenceThresholdStatus =
    document.getElementById("confidence-threshold-status");

function getMinimumConfidence() {
    const saved = Number(
        localStorage.getItem("birdConfidenceThreshold")
    );

    return Number.isFinite(saved) &&
        [10, 30, 50, 70, 80].includes(saved)
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

        if (![10, 30, 50, 70, 80].includes(value)) return;

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
const pauseButton = document.getElementById("pause-listening");
const resumeButton = document.getElementById("resume-listening");
const audioInputSelect = document.getElementById("live-audio-input");
const refreshAudioInputsButton = document.getElementById("refresh-audio-inputs");
const alertOutputSelect = document.getElementById("live-alert-output");
const alertOutputDescription =
    document.getElementById("live-alert-output-description");

function getSelectedAlertOutput() {
    const selected = alertOutputSelect?.value ||
        localStorage.getItem("birdAlertOutput") ||
        "arduino";
    return selected === "laptop" ? "laptop" : "arduino";
}

if (alertOutputSelect) {
    const savedOutput = localStorage.getItem("birdAlertOutput");
    alertOutputSelect.value =
        savedOutput === "laptop" ? "laptop" : "arduino";
    alertOutputSelect.addEventListener("change", () => {
        const output = getSelectedAlertOutput();
        localStorage.setItem("birdAlertOutput", output);
        if (alertOutputDescription) {
            alertOutputDescription.textContent = output === "laptop"
                ? "Qualifying bird detections play the browser bird-alert sound on this computer."
                : "Qualifying bird detections activate the Arduino physical buzzer.";
        }
    });
    alertOutputSelect.dispatchEvent(new Event("change"));
}

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
const LIVE_SEGMENT_DURATION_MS = 15_000;
const MAX_QUEUED_LIVE_SEGMENTS = 2;
let liveMonitoringActive = false;
let liveMonitoringStarting = false;
let liveMonitoringPaused = false;
let liveSegmentTimer = null;
let liveSegmentStartedAt = null;
let liveSegmentRemainingMs = LIVE_SEGMENT_DURATION_MS;
let liveSegmentQueue = [];
let liveSegmentProcessing = false;
let liveSegmentNumber = 0;
let liveSessionSegmentsAnalysed = 0;
let liveSessionStartedAt = null;
let liveSessionElapsedBeforePause = 0;
let liveSessionTimer = null;
let liveMonitoringError = false;

function updateAudioInputName() {
    if (!audioInputSelect) return;

    const selectedOption = audioInputSelect.selectedOptions[0];
    const nameElement = document.getElementById("live-audio-input-name");
    if (nameElement) {
        nameElement.textContent = selectedOption
            ? selectedOption.textContent
            : "System default microphone";
    }
}

async function refreshAudioInputDevices(preferredDeviceId = null) {
    if (!audioInputSelect || !navigator.mediaDevices?.enumerateDevices) return;

    const selectedDeviceId = preferredDeviceId || audioInputSelect.value;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === "audioinput");
        audioInputSelect.replaceChildren(
            new Option("System default microphone", "")
        );

        audioInputs.forEach((device, index) => {
            audioInputSelect.add(
                new Option(
                    device.label || `Microphone ${index + 1}`,
                    device.deviceId
                )
            );
        });

        if (
            selectedDeviceId &&
            audioInputs.some(device => device.deviceId === selectedDeviceId)
        ) {
            audioInputSelect.value = selectedDeviceId;
        }
        updateAudioInputName();
    } catch (error) {
        console.error("Could not enumerate microphone devices:", error);
        const nameElement = document.getElementById("live-audio-input-name");
        if (nameElement) nameElement.textContent = "Device list unavailable";
    }
}

if (audioInputSelect) {
    audioInputSelect.addEventListener("change", updateAudioInputName);
}
if (refreshAudioInputsButton) {
    refreshAudioInputsButton.addEventListener(
        "click",
        () => refreshAudioInputDevices()
    );
}
if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener(
        "devicechange",
        () => refreshAudioInputDevices()
    );
}


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
    canvasContext.strokeStyle = "#30445a";
    canvasContext.lineWidth = 1;
    canvasContext.moveTo(0, height / 2);
    canvasContext.lineTo(width, height / 2);
    canvasContext.stroke();

    // Draw microphone waveform.
    canvasContext.beginPath();
    canvasContext.strokeStyle = "#38bdf8";
    canvasContext.lineWidth = 3;

    const sliceWidth = width / waveformData.length;
    let signalEnergy = 0;

    for (let i = 0; i < waveformData.length; i++) {
        const value = (waveformData[i] - 128) / 128;
        signalEnergy += value * value;
        const y = height / 2 + value * height * 0.4;
        const x = i * sliceWidth;

        if (i === 0) {
            canvasContext.moveTo(x, y);
        } else {
            canvasContext.lineTo(x, y);
        }
    }

    canvasContext.stroke();

    const signalLevel = Math.min(
        100,
        Math.round(
            Math.sqrt(signalEnergy / waveformData.length) * 100
        )
    );
    const levelElement =
        document.getElementById("live-mic-level");
    const levelMeter = document.querySelector(".microphone-level");

    if (levelElement) {
        levelElement.textContent = `${signalLevel}%`;
    }

    if (levelMeter) {
        levelMeter.setAttribute("aria-valuenow", String(signalLevel));
    }

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

    const riskElement =
        document.getElementById("live-pest-risk");

    const messageElement =
        document.getElementById("detection-message");

    const listElement =
        document.getElementById("live-detection-list");

    const minimumConfidence = getMinimumConfidence() / 100;

    const predictions = Array.isArray(result.predictions)
        ? result.predictions
        : [];

    const validPredictions = predictions.filter(prediction =>
        Number.isFinite(Number(prediction.confidence)) &&
        prediction.scientific_name
    );
    const filteredPredictions = validPredictions.filter(prediction =>
        Number(prediction.confidence) >= minimumConfidence
    );
    const showingBelowThresholdCandidate =
        filteredPredictions.length === 0 && validPredictions.length > 0;
    const displayedPredictions = showingBelowThresholdCandidate
        ? [validPredictions.reduce((best, prediction) =>
            Number(prediction.confidence) > Number(best.confidence)
                ? prediction
                : best
        )]
        : filteredPredictions;

    // Group predictions by scientific name.
    const groupedSpecies = new Map();

    displayedPredictions.forEach(prediction => {
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

    if (riskElement) {
        riskElement.textContent = "Insufficient data";
    }

    // No verified bird detections were returned for this segment.
    if (speciesGroups.length === 0) {
        if (messageElement) {
            messageElement.textContent =
                "BirdNET did not identify a verified bird species in this segment. Other monitoring segments are unaffected.";
        }

        if (listElement) {
            listElement.textContent =
                "No verified bird detections were returned for this segment. Try recording again; other segments are unaffected.";
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

    // Crop evidence is separate from BirdNET confidence and field risk.
    let pestLabel = "Pest status unknown";

    if (assessment.classification === "pest") {
        if (assessment.selected_stage_match === true) {
            pestLabel = "Verified pest relationship · stage documented";
        } else if (assessment.selected_stage_match === false) {
            pestLabel = "Verified pest relationship · stage not documented";
        } else {
            pestLabel = "Verified pest relationship · stage unknown";
        }
    } else if (assessment.classification === "non_pest") {
        pestLabel = "Verified non-pest relationship";
    } else if (assessment.evidence_status === "pending") {
        pestLabel = "Pest status unknown · evidence pending source review";
    } else if (
        assessment.evidence_status === "unknown" ||
        assessment.evidence_status === "rejected"
    ) {
        pestLabel = "Pest status unknown · no verified relationship";
    } else if (assessment.evidence_status === "conflicting") {
        pestLabel = "Conflicting verified evidence";
    } else if (assessment.relationship === "beneficial") {
        pestLabel = "Verified beneficial relationship";
    } else if (assessment.relationship === "neutral") {
        pestLabel = "Verified neutral relationship";
    }

    const risk = assessment.pest_risk_percentage;

    if (pestElement) {
        pestElement.textContent = pestLabel;
    }

    if (riskElement) {
        riskElement.textContent =
            assessment.risk_assessment_status === "validated" &&
            risk !== null &&
            risk !== undefined
                ? risk + "%"
                : "Insufficient data";
    }

    const totalSegments = speciesGroups.reduce(
        (total, species) =>
            total + species.detectionCount,
        0
    );

    if (messageElement) {
        messageElement.textContent = showingBelowThresholdCandidate
            ? `No detections met the ${getMinimumConfidence()}% display threshold. Showing the strongest candidate for review; siren alerts require at least 80% confidence.`
            : `${speciesGroups.length} unique species found across ${totalSegments} detection segments meeting the ${getMinimumConfidence()}% display threshold.`;
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

        const sirenThreshold = Number(
            result.buzzer_alert?.confidence_threshold ?? 0.8
        );
        addDetail(
            "Siren eligibility",
            Number(species.confidence) >= sirenThreshold
                ? "Meets confidence threshold"
                : `Below ${Math.round(sirenThreshold * 100)}% confidence threshold`
        );

        addDetail("Detection segments", species.detectionCount);

        addDetail(
            "Crop relationship",
            crop.relationship || "Unknown"
        );

        addDetail(
            "Evidence status",
            crop.evidence_status === "pending"
                ? "Pending source verification"
                : crop.evidence_status || "Unknown"
        );

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
            crop.risk_assessment_status === "validated" &&
            crop.pest_risk_percentage !== null &&
            crop.pest_risk_percentage !== undefined
                ? crop.pest_risk_percentage + "%"
                : "Insufficient data"
        );

        if (crop.risk_assessment_note) {
            addDetail("Risk assessment", crop.risk_assessment_note);
        }

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

            sourceHeading.textContent =
                crop.evidence_status === "verified"
                    ? "Verified evidence sources"
                    : "Sources pending review";
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

function updateLiveDetectionEvent(result) {
    const timestamp = new Date();
    const timestampLabel = timestamp.toLocaleString();
    const timestampElement =
        document.getElementById("live-result-timestamp");
    const eventList =
        document.getElementById("live-detection-events");

    if (timestampElement) {
        timestampElement.textContent = timestampLabel;
    }

    const predictions = Array.isArray(result.predictions)
        ? result.predictions
        : [];
    const minimumConfidence = getMinimumConfidence() / 100;
    const bestPrediction = predictions
        .filter(prediction =>
            prediction.scientific_name &&
            Number.isFinite(Number(prediction.confidence))
        )
        .sort(
            (left, right) =>
                Number(right.confidence) - Number(left.confidence)
        )[0];
    const meetsThreshold = bestPrediction &&
        Number(bestPrediction.confidence) >= minimumConfidence;

    if (!eventList) return;

    const emptyMessage = eventList.querySelector(".live-events-empty");
    if (emptyMessage) emptyMessage.remove();

    const event = document.createElement("article");
    event.className = "live-detection-event";

    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = bestPrediction
        ? `${meetsThreshold ? "" : "Below display threshold · "}${bestPrediction.common_name || bestPrediction.scientific_name}`
        : "No bird detected in this segment";

    const scientificName = document.createElement("span");
    scientificName.textContent = bestPrediction
        ? `${bestPrediction.scientific_name}${result.history_saved ? " · saved to history" : ""}`
        : "Segment analysed; no verified bird species was identified.";
    details.append(name, scientificName);

    const metadata = document.createElement("div");
    metadata.className = "live-event-meta";
    const confidence = document.createElement("strong");
    confidence.textContent = bestPrediction
        ? `${(Number(bestPrediction.confidence) * 100).toFixed(1)}%`
        : result.history_saved ? "No detection" : "Not saved";
    const time = document.createElement("time");
    time.dateTime = timestamp.toISOString();
    time.textContent = timestamp.toLocaleTimeString();
    metadata.append(confidence, time);

    event.append(details, metadata);
    eventList.prepend(event);

    while (eventList.children.length > 20) {
        eventList.lastElementChild.remove();
    }
}

function updateLiveBuzzerAlertResult(result) {
    const element = document.getElementById("live-buzzer-alert-result");
    if (!element) return;

    const alert = result.buzzer_alert;
    if (!alert) {
        element.textContent =
            "Buzzer alert result is unavailable from the backend.";
        return;
    }

    const threshold = Number(alert.confidence_threshold);
    const thresholdLabel = Number.isFinite(threshold)
        ? `${(threshold * 100).toFixed(0)}%`
        : "configured";

    if (alert.status === "queued") {
        element.textContent =
            `Verified bird identification ${alert.species} met the ${thresholdLabel} confidence threshold. ` +
            "The buzzer alert was queued; this is not a crop-pest or damage assessment.";
    } else if (alert.status === "laptop_sound") {
        element.textContent =
            `Verified bird identification ${alert.species} met the ${thresholdLabel} confidence threshold. ` +
            "Laptop sound is selected; no Arduino buzzer command was sent.";
    } else if (alert.status === "offline") {
        element.textContent =
            `Bird identification ${alert.species} met the ${thresholdLabel} threshold, ` +
            "but the Arduino bridge is offline; no buzzer command was sent.";
    } else if (alert.status === "cooldown") {
        element.textContent =
            `Bird identification ${alert.species} met the ${thresholdLabel} threshold, ` +
            "but the duplicate-alert cooldown suppressed this buzzer command.";
    } else {
        element.textContent =
            `No verified bird detection met the configured ${thresholdLabel} buzzer threshold.`;
    }
}


// =====================================
// SEND RECORDING TO BIRDNET API
// =====================================

async function analyseRecording(
    audioBlob,
    segmentNumber = 0,
    saveEmptyRecording = true
) {
    if (!(audioBlob instanceof Blob) || audioBlob.size === 0) {
        throw new Error("The audio segment is empty and was not sent to BirdNET.");
    }

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
        analysisTitle.textContent = liveMonitoringActive
            ? "Analysing live segment..."
            : "Analysing recording...";
    }

    if (analysisDescription) {
        analysisDescription.textContent =
            "Uploading audio, identifying bird species and assessing the selected crop.";
    }

    if (analysisSpinner) {
        analysisSpinner.style.display = "block";
    }

    if (recordingStatus) {
        recordingStatus.textContent = liveMonitoringActive
            ? `Monitoring active. Analysing segment ${segmentNumber}...`
            : "Recording stopped. Analysing bird sounds...";
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
        formData.append("alert_output", getSelectedAlertOutput());
        formData.append(
            "confidence_threshold",
            String(getMinimumConfidence() / 100)
        );
        formData.append(
            "save_empty_recording",
            String(saveEmptyRecording)
        );

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
            `${API_BASE_URL}/api/recordings`,
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
        updateLiveDetectionEvent(result);
        handleDetectionAlerts(result);
        updateLiveBuzzerAlertResult(result);
        liveSessionSegmentsAnalysed += 1;
        updateLiveSessionMetrics();

        updateTimer();

        if (analysisPanel) {
            analysisPanel.classList.add("completed");
        }

        if (analysisTitle) {
            analysisTitle.textContent = result.history_saved === false
                ? "Segment analysed; no detection saved"
                : liveMonitoringActive
                    ? "Live segment analysed and saved"
                    : "Analysis completed successfully!";
        }

        if (analysisDescription) {
            if (result.history_saved === false) {
                analysisDescription.textContent =
                    "No verified bird was identified in this segment. Empty segments are not stored.";
            } else {
                analysisDescription.textContent = liveMonitoringActive
                    ? "Bird identification and crop assessment are complete. Monitoring will continue."
                    : "Bird identification and crop assessment are complete.";
            }
        }

        if (analysisSpinner) {
            analysisSpinner.style.display = "none";
        }

        if (recordingStatus) {
            recordingStatus.textContent = liveMonitoringActive
                ? result.history_saved === false
                    ? `Segment ${segmentNumber} analysed; no detection to save. Listening continuously...`
                    : `Segment ${segmentNumber} saved. Listening continuously...`
                : result.history_saved === false
                    ? "Final segment analysed; no bird detection to save."
                    : "Bird detection and crop assessment completed successfully.";
        }

        if (liveMonitoringActive) loadDashboardMetrics();

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
    if (liveMonitoringActive || liveMonitoringStarting) return;

    const selectedCrop = localStorage.getItem("selectedCrop");
    const selectedStage = localStorage.getItem("selectedGrowthStage");

    if (!selectedCrop || !selectedStage) {
        if (recordingStatus) {
            recordingStatus.textContent =
                "Select and save your crop and growth stage before starting monitoring.";
        }
        return;
    }

    liveMonitoringError = false;
    try {
        const context = makeAlertAudioContext();
        if (context.state === "suspended") await context.resume();
    } catch (error) {
        console.warn("Alert audio is unavailable until browser interaction:", error);
        setAlertStatus(`Monitoring can start, but sirens are unavailable: ${error.message}`);
    }

    liveMonitoringStarting = true;
    updateLiveMonitoringControls();

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

        if (recordingStatus) {
            recordingStatus.textContent =
                "Requesting microphone permission...";
        }

        const selectedDeviceId = audioInputSelect?.value;
        const audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };
        if (selectedDeviceId) {
            audioConstraints.deviceId = { exact: selectedDeviceId };
        }

        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints
        });
        const activeTrack = audioStream.getAudioTracks()[0];
        activeTrack?.addEventListener("ended", () => {
            if (liveMonitoringActive) {
                handleLiveMonitoringFailure(
                    new Error("The selected microphone disconnected.")
                );
            }
        });
        await refreshAudioInputDevices(
            activeTrack?.getSettings().deviceId || selectedDeviceId || null
        );

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

        stopWaveform();

        requestAnimationFrame(() => {
            resizeWaveform();
            drawWaveform();
        });

        if (audioPreview) {
            audioPreview.hidden = true;
            audioPreview.removeAttribute("src");
        }

        if (!window.MediaRecorder) {
            throw new Error(
                "MediaRecorder is not supported in this browser."
            );
        }

        liveMonitoringActive = true;
        liveMonitoringStarting = false;
        liveMonitoringPaused = false;
        liveMonitoringError = false;
        liveSegmentNumber = 0;
        liveSessionSegmentsAnalysed = 0;
        liveSessionStartedAt = Date.now();
        liveSessionElapsedBeforePause = 0;
        localStorage.setItem("birdMonitoringStartedAt", new Date(liveSessionStartedAt).toISOString());
        updateLiveSessionMetrics();
        if (liveSessionTimer !== null) window.clearInterval(liveSessionTimer);
        liveSessionTimer = window.setInterval(updateLiveSessionMetrics, 1000);
        if (alertAudioContext && alertAudioContext.state === "suspended") {
            await alertAudioContext.resume();
        }
        updateLiveMonitoringControls();

        const analysisPanel =
            document.getElementById("analysis-panel");

        if (analysisPanel) {
            analysisPanel.hidden = false;
            analysisPanel.classList.remove("completed", "failed");
        }

        const analysisTitle =
            document.getElementById("analysis-title");
        const analysisDescription =
            document.getElementById("analysis-description");

        if (analysisTitle) {
            analysisTitle.textContent = "Continuous BirdNET analysis";
        }

        if (analysisDescription) {
            analysisDescription.textContent =
                "Each 15-second audio segment is analysed. Segments with detected birds are saved to history.";
        }

        startLiveRecordingSegment();

        if (recordingStatus) {
            recordingStatus.textContent =
                "Listening continuously. The first 15-second segment is being captured.";
        }

    } catch (error) {
        console.error("Microphone error:", error);

        liveMonitoringActive = false;
        liveMonitoringError = true;
        liveMonitoringPaused = false;
        updateLiveMonitoringControls();
        try {
            await releaseMicrophone();
        } catch (cleanupError) {
            console.error(
                "Could not release microphone resources:",
                cleanupError
            );
        }
        liveMonitoringStarting = false;
        updateLiveMonitoringControls();

        if (recordingStatus) {
            recordingStatus.textContent =
                "Microphone error: " + error.message;
        }
    }
}

function updateLiveMonitoringControls() {
    if (audioInputSelect) {
        audioInputSelect.disabled = liveMonitoringActive || liveMonitoringStarting;
    }

    if (startButton) {
        startButton.disabled =
            liveMonitoringActive ||
            liveMonitoringStarting ||
            liveSegmentProcessing ||
            liveSegmentQueue.length > 0;
    }

    if (pauseButton) {
        pauseButton.disabled = !liveMonitoringActive || liveMonitoringPaused;
    }

    if (resumeButton) {
        resumeButton.disabled = !liveMonitoringActive || !liveMonitoringPaused;
    }

    if (stopButton) {
        stopButton.disabled = !liveMonitoringActive;
    }

    const status = document.getElementById("live-monitoring-state");
    const title = document.getElementById("live-monitoring-title");
    const microphoneStatus = document.getElementById("live-microphone-status");

    if (microphoneStatus) {
        microphoneStatus.textContent = audioStream
            ? liveMonitoringPaused ? "PAUSED" : "ACTIVE"
            : liveMonitoringStarting ? "REQUESTING"
                : liveMonitoringError ? "ERROR" : "OFF";
    }

    if (status) {
        status.textContent = liveMonitoringActive
            ? liveMonitoringPaused ? "● PAUSED" : liveSegmentProcessing
                ? "● ANALYSING" : "● LISTENING"
            : liveMonitoringStarting ? "● ANALYSING"
                : liveMonitoringError ? "● ERROR"
                    : localStorage.getItem("birdMonitoringStartedAt") ? "● STOPPED" : "● READY";
        status.classList.toggle("is-active", liveMonitoringActive && !liveMonitoringPaused);
        status.classList.toggle("is-paused", liveMonitoringPaused);
        status.classList.toggle("is-error", liveMonitoringError);
    }

    if (title) {
        title.textContent = liveMonitoringActive
            ? liveMonitoringPaused
                ? "Monitoring paused"
                : "Listening continuously"
            : liveMonitoringStarting
                ? "Finishing microphone session"
                : liveSegmentProcessing || liveSegmentQueue.length > 0
                    ? "Analysing queued segments"
                    : "Ready to monitor";
    }
    updateDashboardMonitoringState();
}

function armLiveSegmentTimer(durationMs) {
    if (liveSegmentTimer !== null) {
        window.clearTimeout(liveSegmentTimer);
    }

    liveSegmentRemainingMs = durationMs;
    liveSegmentStartedAt = Date.now();
    liveSegmentTimer = window.setTimeout(() => {
        liveSegmentTimer = null;
        liveSegmentStartedAt = null;

        if (
            liveMonitoringActive &&
            !liveMonitoringPaused &&
            mediaRecorder &&
            mediaRecorder.state === "recording"
        ) {
            mediaRecorder.stop();
        }
    }, durationMs);
}

function startLiveRecordingSegment() {
    if (
        !liveMonitoringActive ||
        liveMonitoringPaused ||
        !audioStream ||
        !window.MediaRecorder
    ) {
        return;
    }

    const options = {};

    if (
        MediaRecorder.isTypeSupported &&
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ) {
        options.mimeType = "audio/webm;codecs=opus";
    }

    const segmentRecorder = new MediaRecorder(audioStream, options);
    const chunks = [];
    const segmentNumber = ++liveSegmentNumber;

    mediaRecorder = segmentRecorder;
    liveSegmentRemainingMs = LIVE_SEGMENT_DURATION_MS;

    segmentRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
            chunks.push(event.data);
        }
    };

    segmentRecorder.onerror = event => {
        const error = event.error || new Error("Audio recording failed.");
        handleLiveMonitoringFailure(error);
    };

    segmentRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, {
            type: segmentRecorder.mimeType || "audio/webm"
        });

        if (mediaRecorder === segmentRecorder) {
            mediaRecorder = null;
        }

        if (liveMonitoringActive && !liveMonitoringPaused) {
            try {
                startLiveRecordingSegment();
            } catch (error) {
                handleLiveMonitoringFailure(error);
            }
        } else if (!liveMonitoringActive) {
            finishLiveMonitoring();
        }

        if (audioBlob.size > 0) {
            enqueueLiveSegment(audioBlob, segmentNumber);
        }
    };

    segmentRecorder.start();
    armLiveSegmentTimer(liveSegmentRemainingMs);
}

function enqueueLiveSegment(audioBlob, segmentNumber) {
    if (liveSegmentQueue.length >= MAX_QUEUED_LIVE_SEGMENTS) {
        console.warn(
            `Live segment ${segmentNumber} was not queued because BirdNET analysis is behind.`
        );

        if (recordingStatus) {
            recordingStatus.textContent =
                "Audio capture continues, but a segment was skipped because analysis is behind.";
        }
        return;
    }

    liveSegmentQueue.push({ audioBlob, segmentNumber });
    processLiveSegmentQueue();
}

async function processLiveSegmentQueue() {
    if (liveSegmentProcessing) return;

    liveSegmentProcessing = true;

    try {
        while (liveSegmentQueue.length > 0) {
            const segment = liveSegmentQueue.shift();

            try {
                await analyseRecording(
                    segment.audioBlob,
                    segment.segmentNumber,
                    false
                );
            } catch (error) {
                console.error(
                    `BirdNET analysis failed for segment ${segment.segmentNumber}:`,
                    error
                );

                if (recordingStatus) {
                    recordingStatus.textContent =
                        `Segment ${segment.segmentNumber} analysis failed: ${error.message}`;
                }
            }
        }
    } finally {
        liveSegmentProcessing = false;
        updateLiveMonitoringControls();
    }
}

async function finishLiveMonitoring() {
    try {
        await releaseMicrophone();
    } catch (error) {
        console.error("Could not release microphone resources:", error);
        if (recordingStatus) {
            recordingStatus.textContent =
                "Monitoring stopped, but microphone cleanup failed: " +
                error.message;
        }
    } finally {
        liveMonitoringStarting = false;
        updateLiveMonitoringControls();
    }
}

async function releaseMicrophone() {
    stopWaveform();

    if (liveSegmentTimer !== null) {
        window.clearTimeout(liveSegmentTimer);
        liveSegmentTimer = null;
    }

    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }

    if (audioContext) {
        const contextToClose = audioContext;
        audioContext = null;
        analyser = null;
        microphoneSource = null;
        await contextToClose.close();
    }

    mediaRecorder = null;
}

function pauseListening() {
    if (!liveMonitoringActive || liveMonitoringPaused) return;

    liveMonitoringPaused = true;
    if (liveSessionStartedAt !== null) {
        liveSessionElapsedBeforePause += Date.now() - liveSessionStartedAt;
        liveSessionStartedAt = null;
    }

    if (liveSegmentTimer !== null) {
        window.clearTimeout(liveSegmentTimer);
        liveSegmentTimer = null;

        if (liveSegmentStartedAt !== null) {
            liveSegmentRemainingMs = Math.max(
                0,
                liveSegmentRemainingMs -
                (Date.now() - liveSegmentStartedAt)
            );
            liveSegmentStartedAt = null;
        }
    }

    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.pause();
    }

    updateLiveMonitoringControls();

    if (recordingStatus) {
        recordingStatus.textContent =
            "Monitoring paused. Resume to continue capturing audio.";
    }
}

function resumeListening() {
    if (!liveMonitoringActive || !liveMonitoringPaused) return;

    liveMonitoringPaused = false;
    liveSessionStartedAt = Date.now();

    if (mediaRecorder && mediaRecorder.state === "paused") {
        mediaRecorder.resume();
        armLiveSegmentTimer(liveSegmentRemainingMs);
    } else {
        startLiveRecordingSegment();
    }

    updateLiveMonitoringControls();

    if (recordingStatus) {
        recordingStatus.textContent =
            "Listening continuously. Audio is analysed in 15-second segments.";
    }
}

function handleLiveMonitoringFailure(error) {
    console.error("Live monitoring error:", error);
    liveMonitoringActive = false;
    liveMonitoringStarting = true;
    liveMonitoringPaused = false;
    if (liveSessionStartedAt !== null) {
        liveSessionElapsedBeforePause += Date.now() - liveSessionStartedAt;
    }
    liveSessionStartedAt = null;
    if (liveSessionTimer !== null) {
        window.clearInterval(liveSessionTimer);
        liveSessionTimer = null;
    }

    if (liveSegmentTimer !== null) {
        window.clearTimeout(liveSegmentTimer);
        liveSegmentTimer = null;
    }

    updateLiveMonitoringControls();

    if (recordingStatus) {
        recordingStatus.textContent =
            "Live monitoring stopped: " + error.message;
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    } else {
        finishLiveMonitoring();
    }
}


// =====================================
// STOP MICROPHONE
// =====================================

function stopListening() {
    if (!liveMonitoringActive) return;

    liveMonitoringActive = false;
    liveMonitoringStarting = true;
    liveMonitoringPaused = false;
    if (liveSessionStartedAt !== null) {
        liveSessionElapsedBeforePause += Date.now() - liveSessionStartedAt;
    }
    liveSessionStartedAt = null;

    if (liveSegmentTimer !== null) {
        window.clearTimeout(liveSegmentTimer);
        liveSegmentTimer = null;
    }
    if (liveSegmentStartedAt !== null) {
        liveSegmentRemainingMs = Math.max(
            0,
            liveSegmentRemainingMs - (Date.now() - liveSegmentStartedAt)
        );
        liveSegmentStartedAt = null;
    }

    updateLiveMonitoringControls();

    if (recordingStatus) {
        recordingStatus.textContent =
            "Monitoring stopped. The final segment will be analysed; any detected birds will be saved.";
    }
    updateLiveSessionMetrics();
    if (liveSessionTimer !== null) {
        window.clearInterval(liveSessionTimer);
        liveSessionTimer = null;
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    } else {
        finishLiveMonitoring();
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

if (pauseButton) {
    pauseButton.addEventListener("click", pauseListening);
}

if (resumeButton) {
    resumeButton.addEventListener("click", resumeListening);
}

window.addEventListener("resize", () => {
    resizeWaveform();
});


// =====================================
// INITIALIZATION
// =====================================

updateCropDisplays();
updateConfidenceThresholdDisplay();
refreshAudioInputDevices();

console.log("Bird Guard AI frontend loaded.");
console.log("Microphone recording and BirdNET API integration ready.");

// =============================================
// BIRD GUARD AI - DETECTION HISTORY
// =============================================

const HISTORY_API = API_BASE_URL;
const DASHBOARD_HISTORY_LIMIT = 500;

let historyRecords = [];

const historyList = document.getElementById("history-list");
const historyTableBody = document.getElementById("history-table-body");
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
        if (historyTableBody) historyTableBody.replaceChildren();
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

    renderHistoryTable(filteredRecords);

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
                "Evidence status",
                evidenceStatusLabel(assessment.evidence_status)
            );

            addPredictionDetail(
                "Crop impact",
                assessment.crop_impact || "Not documented"
            );

            const evidenceSource = Array.isArray(assessment.sources)
                ? assessment.sources.find(source => source.evidence_status === "verified")
                : null;
            addPredictionDetail(
                "Evidence source",
                evidenceSource?.title || "No verified source"
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

function renderHistoryTable(records) {
    if (!historyTableBody) return;
    historyTableBody.replaceChildren();

    if (!records.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 8;
        cell.textContent = historyRecords.length
            ? "No records match your search or crop filter."
            : "No saved recordings yet.";
        row.appendChild(cell);
        historyTableBody.appendChild(row);
        return;
    }

    records.forEach(record => {
        const predictions = Array.isArray(record.predictions) ? record.predictions : [];
        const rows = predictions.length ? predictions : [null];
        rows.forEach((prediction, index) => {
            const assessment = prediction?.crop_assessment || {};
            const row = document.createElement("tr");
            const values = [
                historyDate(record.created_at),
                prediction ? prediction.common_name || prediction.scientific_name || "Unknown species" : "No bird detected in this recording",
                prediction?.scientific_name || "—",
                prediction && Number.isFinite(Number(prediction.confidence))
                    ? `${(Number(prediction.confidence) * 100).toFixed(1)}%` : "—",
                historyLabel(record.selected_crop)
            ];
            values.forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            const evidenceCell = document.createElement("td");
            evidenceCell.textContent = evidenceStatusLabel(assessment.evidence_status);
            evidenceCell.className = `evidence-status evidence-${assessment.evidence_status || "unknown"}`;
            row.appendChild(evidenceCell);

            const classificationCell = document.createElement("td");
            classificationCell.textContent =
                assessment.classification === "pest" && assessment.evidence_status === "verified"
                    ? "Confirmed pest"
                    : assessment.classification === "non_pest" && assessment.evidence_status === "verified"
                        ? "Verified non-pest"
                        : "Pest status unknown";
            row.appendChild(classificationCell);

            const actionsCell = document.createElement("td");
            if (record.audio_url) {
                const audio = document.createElement("audio");
                audio.controls = true;
                audio.preload = "none";
                audio.src = `${HISTORY_API}${record.audio_url}`;
                audio.setAttribute("aria-label", `Audio recording from ${historyDate(record.created_at)}`);
                actionsCell.appendChild(audio);
            } else {
                actionsCell.textContent = "Audio unavailable";
            }
            if (index === 0) {
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "danger-button history-delete";
                deleteButton.textContent = "Delete recording";
                deleteButton.addEventListener("click", async () => {
                    if (!window.confirm("Delete this history record and its saved audio?")) return;
                    await deleteHistoryRecord(record.recording_id);
                });
                actionsCell.appendChild(deleteButton);
            }
            row.appendChild(actionsCell);
            historyTableBody.appendChild(row);
        });
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
    const confidenceCounts = {
        "<30%": 0,
        "30–49%": 0,
        "50–69%": 0,
        "70–89%": 0,
        "90%+": 0
    };
    const pestCropCounts = {};
    const timeOfDayCounts = {
        "00–05": 0,
        "06–11": 0,
        "12–17": 0,
        "18–23": 0
    };

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

            const confidence = Number(prediction.confidence);
            if (Number.isFinite(confidence)) {
                const confidencePercent = confidence * 100;
                const bucket = confidencePercent < 30 ? "<30%"
                    : confidencePercent < 50 ? "30–49%"
                        : confidencePercent < 70 ? "50–69%"
                            : confidencePercent < 90 ? "70–89%" : "90%+";
                confidenceCounts[bucket] += 1;
            }

            const assessment = prediction.crop_assessment || {};
            if (
                assessment.classification === "pest" &&
                assessment.relationship === "pest" &&
                assessment.evidence_status === "verified"
            ) {
                pestCropCounts[crop] = (pestCropCounts[crop] || 0) + 1;
            }
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
                    (activityCounts[dateKey] || 0) + predictions.length;

                const hour = date.getHours();
                const period = hour < 6 ? "00–05"
                    : hour < 12 ? "06–11"
                        : hour < 18 ? "12–17" : "18–23";
                timeOfDayCounts[period] += predictions.length;
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
        "No saved detection data available."
    );

    renderReportBars(
        "report-confidence-chart",
        Object.entries(confidenceCounts).map(([label, value]) => ({ label, value })),
        "No confidence data available."
    );

    renderReportBars(
        "report-pest-chart",
        Object.entries(pestCropCounts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value),
        "No confirmed pest detections with verified crop evidence."
    );

    renderReportBars(
        "report-time-chart",
        Object.entries(timeOfDayCounts).map(([label, value]) => ({ label, value })),
        "No detection-time data available."
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

const IOT_API_URL = `${HISTORY_API}/api/iot/sensor`;
const IOT_STATUS_URL = `${HISTORY_API}/api/iot/status`;

let iotReadings = [];
let iotPollingTimer = null;
let dashboardMetricsTimer = null;
let dashboardMetricsRequest = null;

function setDashboardMetric(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

async function fetchDashboardJson(url, label) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`${label} request failed (${response.status}).`);
    }

    return response.json();
}

function renderDashboardSpecies(records) {
    const species = new Set();
    let detections = 0;
    let verifiedPests = 0;

    records.forEach(record => {
        const predictions = Array.isArray(record.predictions)
            ? record.predictions
            : [];

        predictions.forEach(prediction => {
            detections += 1;
            const name =
                prediction.scientific_name ||
                prediction.species_name ||
                prediction.common_name;

            if (typeof name === "string" && name.trim()) {
                species.add(name.trim().toLowerCase());
            }

            const assessment = prediction.crop_assessment || {};
            if (
                assessment.classification === "pest" &&
                assessment.relationship === "pest" &&
                assessment.evidence_status === "verified"
            ) {
                verifiedPests += 1;
            }
        });
    });

    setDashboardMetric("dashboard-species-count", species.size);
    setDashboardMetric(
        "dashboard-species-caption",
        `Unique species across ${records.length} saved recordings`
    );
    setDashboardMetric("dashboard-segment-count", records.length);
    setDashboardMetric(
        "dashboard-segment-caption",
        `Saved audio recordings in the latest ${DASHBOARD_HISTORY_LIMIT} records; empty live segments are not stored`
    );
    setDashboardMetric("dashboard-detection-count", detections);
    setDashboardMetric(
        "dashboard-detection-caption",
        "BirdNET prediction events in saved recordings"
    );
    setDashboardMetric("dashboard-pest-count", verifiedPests);
    setDashboardMetric(
        "dashboard-pest-caption",
        "Verified crop-specific pest evidence only"
    );
    renderDashboardActivity(records);
}

function renderDashboardActivity(records) {
    const container = document.getElementById("dashboard-recent-detections");
    if (!container) return;
    container.replaceChildren();

    const recent = records
        .filter(record => Array.isArray(record.predictions) && record.predictions.length)
        .slice(0, 6);

    if (!recent.length) {
        const empty = document.createElement("p");
        empty.className = "status-message";
        empty.textContent = records.length
            ? "No bird detections in the loaded recordings."
            : "No saved recordings yet. Start monitoring to collect field activity.";
        container.appendChild(empty);
        return;
    }

    recent.forEach(record => {
        const prediction = record.predictions.reduce((best, item) =>
            Number(item.confidence) > Number(best.confidence) ? item : best
        );
        const item = document.createElement("article");
        item.className = "overview-event";
        const title = document.createElement("strong");
        title.textContent = prediction.common_name || prediction.scientific_name || "Unknown species";
        const detail = document.createElement("span");
        detail.textContent = `${prediction.scientific_name || "Scientific name unavailable"} · ${Math.round(Number(prediction.confidence) * 100)}%`;
        const time = document.createElement("time");
        time.textContent = historyDate(record.created_at);
        item.append(title, detail, time);
        container.appendChild(item);
    });
}

function renderDashboardSensor(reading) {
    if (!reading) {
        setDashboardMetric("dashboard-iot-status", "No data");
        setDashboardMetric(
            "dashboard-iot-caption",
            "IoT API is available; waiting for a sensor reading."
        );
        setDashboardMetric("dashboard-sound-level", "--");
        setDashboardMetric(
            "dashboard-sound-caption",
            "No sound reading received yet."
        );
        return;
    }

    const soundLevel = Number(reading.sound_level);
    const threshold = Number(reading.threshold);
    const readingTime = new Date(reading.timestamp);
    const ageSeconds = (Date.now() - readingTime.getTime()) / 1000;
    const isRecent =
        Number.isFinite(ageSeconds) &&
        ageSeconds >= 0 &&
        ageSeconds <= 10;

    setDashboardMetric(
        "dashboard-iot-status",
        isRecent ? "Online" : "Offline"
    );

    const readingDescription = Number.isNaN(readingTime.getTime())
        ? "Reading timestamp unavailable."
        : `Last reading ${readingTime.toLocaleTimeString()}.`;

    setDashboardMetric(
        "dashboard-iot-caption",
        isRecent
            ? `${reading.sensor || "Sensor"} connected · ${readingDescription}`
            : `Latest reading is stale · ${readingDescription}`
    );

    if (!Number.isFinite(soundLevel)) {
        setDashboardMetric("dashboard-sound-level", "--");
        setDashboardMetric(
            "dashboard-sound-caption",
            "The latest digital sensor reading is invalid."
        );
        return;
    }

    setDashboardMetric("dashboard-sound-level", soundLevel);

    const status = typeof reading.status === "string"
        ? reading.status
        : "Status unavailable";
    const thresholdText = Number.isFinite(threshold)
        ? ` · active logic level ${threshold}`
        : "";

    setDashboardMetric(
        "dashboard-sound-caption",
        `${status}${thresholdText}${isRecent ? "" : " · stale reading"}`
    );
}

function loadDashboardMetrics() {
    if (!dashboardMetricsRequest) {
        dashboardMetricsRequest = loadDashboardMetricsFromApi()
            .finally(() => { dashboardMetricsRequest = null; });
    }
    return dashboardMetricsRequest;
}

async function loadDashboardMetricsFromApi() {
    const speciesCaption =
        document.getElementById("dashboard-species-caption");
    const iotCaption =
        document.getElementById("dashboard-iot-caption");
    const soundCaption =
        document.getElementById("dashboard-sound-caption");
    const mappedCaption =
        document.getElementById("dashboard-mapped-caption");

    const requests = await Promise.allSettled([
        fetchDashboardJson(
            `${HISTORY_API}/api/field-activity?limit=${DASHBOARD_HISTORY_LIMIT}`,
            "Field activity"
        ),
        fetchDashboardJson(IOT_API_URL, "IoT sensor"),
        fetchDashboardJson(`${API_BASE_URL}/api/health`, "Backend health")
    ]);

    const [fieldResult, sensorResult, healthResult] = requests;

    const systemStatus = document.getElementById("system-status-label");
    const statusDot = document.querySelector(".header-status .status-dot");
    if (healthResult.status === "fulfilled" &&
        healthResult.value &&
        healthResult.value.backend === "online") {
        const birdnetStatus = healthResult.value.birdnet === "loaded"
            ? "BirdNET loaded" : "BirdNET ready on first analysis";
        if (systemStatus) systemStatus.textContent = `Backend online · ${birdnetStatus}`;
        if (statusDot) statusDot.classList.remove("system-offline");
    } else {
        const error = healthResult.status === "rejected"
            ? healthResult.reason
            : new Error("Backend health returned an invalid response.");
        console.error("Backend health check failed:", error);
        if (systemStatus) systemStatus.textContent = "Backend unavailable";
        if (statusDot) statusDot.classList.add("system-offline");
    }

    if (fieldResult.status === "fulfilled" &&
        fieldResult.value &&
        typeof fieldResult.value === "object" &&
        Array.isArray(fieldResult.value.records)) {
        renderDashboardSpecies(fieldResult.value.records);
    } else {
        const error = fieldResult.status === "rejected"
            ? fieldResult.reason
            : new Error("Field activity returned an invalid response.");
        console.error("Dashboard recording metrics failed:", error);
        setDashboardMetric("dashboard-species-count", "Unavailable");
        if (speciesCaption) {
            speciesCaption.textContent = "Could not load saved detections.";
        }
        setDashboardMetric("dashboard-segment-count", "Unavailable");
        setDashboardMetric("dashboard-detection-count", "Unavailable");
        setDashboardMetric("dashboard-pest-count", "Unavailable");
        setDashboardMetric("dashboard-mapped-count", "Unavailable");
    }

    if (fieldResult.status === "fulfilled" &&
        fieldResult.value &&
        typeof fieldResult.value === "object" &&
        Number.isFinite(Number(fieldResult.value.total_locations))) {
        setDashboardMetric(
            "dashboard-mapped-count",
            Number(fieldResult.value.total_locations)
        );
        if (mappedCaption) mappedCaption.textContent =
            `GPS-tagged records in the latest ${DASHBOARD_HISTORY_LIMIT} recordings`;
    } else if (fieldResult.status === "fulfilled") {
        const error = new Error("Field activity returned an invalid location count.");
        console.error("Dashboard mapped-record metric failed:", error);
        setDashboardMetric("dashboard-mapped-count", "Unavailable");
        if (mappedCaption) {
            mappedCaption.textContent = "Could not load GPS field activity.";
        }
    }

    if (sensorResult.status === "fulfilled" &&
        sensorResult.value &&
        typeof sensorResult.value === "object" &&
        Object.prototype.hasOwnProperty.call(sensorResult.value, "data")) {
        renderDashboardSensor(sensorResult.value.data);
    } else {
        const error = sensorResult.status === "rejected"
            ? sensorResult.reason
            : new Error("IoT sensor returned an invalid response.");
        console.error("Dashboard IoT metrics failed:", error);
        setDashboardMetric("dashboard-iot-status", "Unavailable");
        setDashboardMetric(
            "dashboard-iot-caption",
            "Could not reach the IoT sensor API."
        );
        setDashboardMetric("dashboard-sound-level", "--");
        if (soundCaption) {
            soundCaption.textContent = "Sensor sound activity is unavailable.";
        }
    }
    loadDashboardCropEvidence();
    renderAlertHistory();
}

async function loadIotSensor() {
    const backendStatus = document.getElementById("iot-backend-status");
    const soundLevel = document.getElementById("iot-sound-level");
    const activityStatus = document.getElementById("iot-activity-status");
    const sensorStatus = document.getElementById("iot-sensor-status");
    const lastReading = document.getElementById("iot-last-reading");

    try {
        const response = await fetch(IOT_STATUS_URL, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("API request failed");
        }

        const result = await response.json();

        backendStatus.textContent = result.arduino_status || "OFFLINE";
        const buzzerStatus = result.buzzer_status || "OFFLINE";
        const comPort = result.com_port || "Not reported";
        document.getElementById("iot-device-name").textContent =
            "Arduino digital sound sensor";
        document.getElementById("iot-com-port").textContent = comPort;
        document.getElementById("iot-buzzer-status").textContent = buzzerStatus;
        document.getElementById("iot-last-update").textContent =
            new Date().toLocaleTimeString();

        const liveBuzzerStatus = document.getElementById("live-buzzer-status");
        const liveBuzzerDetail = document.getElementById("live-buzzer-detail");
        if (liveBuzzerStatus) liveBuzzerStatus.textContent = buzzerStatus;
        if (liveBuzzerDetail) {
            const thresholdLabel = `${getMinimumConfidence()}%`;
            liveBuzzerDetail.textContent =
                result.arduino_status === "CONNECTED"
                    ? buzzerStatus === "OFFLINE"
                        ? `Arduino bridge connected on ${comPort}, but the Arduino has not confirmed buzzer status. Buzzer alerts require a verified BirdNET identification at ${thresholdLabel} confidence.`
                        : `Arduino bridge connected on ${comPort}; buzzer status is ${buzzerStatus}. Alerts require a verified BirdNET identification at ${thresholdLabel} confidence, not a pest-risk assessment.`
                    : `Arduino bridge is offline. BirdNET detections remain available, but no physical buzzer command can be delivered.`;
        }

        const reading = result.data;

        if (!reading) {
            soundLevel.textContent = "--";
            activityStatus.textContent = result.sensor_status || "UNKNOWN";
            sensorStatus.textContent = "No data";
            document.getElementById("iot-last-update").textContent = "—";
            lastReading.textContent = result.arduino_status === "CONNECTED"
                ? "Arduino is connected; waiting for its first digital sound-sensor reading."
                : "Arduino bridge is offline; no current sensor reading is available.";

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
        const timestampValid = Number.isFinite(readingTime.getTime());

        if (timestampValid && Number.isFinite(ageSeconds) &&
            ageSeconds >= 0 && ageSeconds <= 10) {
            sensorStatus.textContent = "Recent data";
        } else {
            sensorStatus.textContent = "Stale data";
        }

        lastReading.textContent =
            `Last sensor reading: ${reading.status} (digital raw value ${level})` +
            (timestampValid ? ` at ${readingTime.toLocaleString()}.` : ".");
        document.getElementById("iot-last-update").textContent =
            timestampValid ? readingTime.toLocaleTimeString() : "Timestamp unavailable";

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
        console.error("IoT status request failed:", error);
        backendStatus.textContent = "Offline";
        sensorStatus.textContent = "Unavailable";
        activityStatus.textContent = "UNKNOWN";
        document.getElementById("iot-buzzer-status").textContent = "OFFLINE";
        document.getElementById("iot-com-port").textContent = "Not reported";
        document.getElementById("live-buzzer-status").textContent = "OFFLINE";
        document.getElementById("live-buzzer-detail").textContent =
            "Could not reach the Arduino status API.";
        lastReading.textContent =
            "Cannot reach the IoT status API. Check that FastAPI is running.";
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
        1,
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
    context.fillText("Active logic level: " + threshold, left + 5, top + 12);

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
        const livePage = document.getElementById("live");

        if (
            (iotPage && iotPage.classList.contains("active")) ||
            (livePage && livePage.classList.contains("active"))
        ) {
            loadIotSensor();
        }
    }, 3000);
}

if (!dashboardMetricsTimer) {
    dashboardMetricsTimer = setInterval(() => {
        const dashboardPage = document.getElementById("dashboard");

        if (dashboardPage && dashboardPage.classList.contains("active")) {
            loadDashboardMetrics();
        }
    }, 15000);
}

window.addEventListener("resize", () => {
    const iotPage = document.getElementById("iot");

    if (iotPage && iotPage.classList.contains("active")) {
        drawIotChart();
    }
});

if (document.getElementById("dashboard")?.classList.contains("active")) {
    loadDashboardMetrics();
}

// =============================================
// CROP EVIDENCE AND FIELD CONFIGURATION
// =============================================

const cropMonitorCrop = document.getElementById("crop-monitor-crop");
const cropMonitorField = document.getElementById("crop-monitor-field");
const cropMonitorStage = document.getElementById("crop-monitor-stage");
const cropEvidenceList = document.getElementById("crop-evidence-list");
const cropEvidenceStatus = document.getElementById("crop-evidence-status");
const refreshCropEvidenceButton = document.getElementById("refresh-crop-evidence");
const manualCropEvidenceForm =
    document.getElementById("manual-crop-evidence-form");
let cropEvidenceRequest = null;

function updateManualEvidenceCropLabel() {
    const label = document.getElementById("manual-evidence-current-crop");
    if (!label || !cropMonitorCrop) return;
    label.textContent =
        cropMonitorCrop.selectedOptions[0]?.textContent.trim() || "Not selected";
}

function syncCropMonitorSelection() {
    const crop = localStorage.getItem("selectedCrop");
    const stage = localStorage.getItem("selectedGrowthStage");
    if (cropMonitorCrop && crop && cropMonitorCrop.querySelector(`option[value="${crop}"]`)) {
        cropMonitorCrop.value = crop;
    }
    if (cropMonitorStage && stage && cropMonitorStage.querySelector(`option[value="${stage.replace(/-/g, "_")}"]`)) {
        cropMonitorStage.value = stage.replace(/-/g, "_");
    }
    if (cropMonitorField) {
        cropMonitorField.value = localStorage.getItem("selectedFieldName") || "";
    }
    updateManualEvidenceCropLabel();
}

function saveCropMonitorConfiguration(refreshEvidence = true) {
    if (!cropMonitorCrop || !cropMonitorStage) return;
    localStorage.setItem("selectedCrop", cropMonitorCrop.value);
    localStorage.setItem("selectedGrowthStage", cropMonitorStage.value);
    updateCropDisplays();
    if (cropMonitorField) localStorage.setItem("selectedFieldName", cropMonitorField.value.trim());
    updateManualEvidenceCropLabel();

    const dashboardCrop = document.getElementById("crop-select");
    const dashboardStage = document.getElementById("growth-stage");
    if (dashboardCrop) dashboardCrop.value = cropMonitorCrop.value;
    if (dashboardStage) dashboardStage.value = cropMonitorStage.value.replace(/_/g, "-");
    if (refreshEvidence) {
        loadCropEvidence();
        loadDashboardCropEvidence();
    }
}

function evidenceStatusLabel(status) {
    return ({
        verified: "VERIFIED",
        pending: "PENDING REVIEW",
        rejected: "REJECTED",
        unknown: "UNKNOWN"
    })[status] || "UNKNOWN";
}

function renderCropEvidence(records) {
    if (!cropEvidenceList) return;
    cropEvidenceList.replaceChildren();
    if (!records.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 7;
        cell.textContent =
            "No crop-specific evidence is recorded for this crop. Add an entry above to begin building its reference list.";
        row.appendChild(cell);
        cropEvidenceList.appendChild(row);
        return;
    }

    records.forEach(record => {
        const row = document.createElement("tr");
        const fields = [
            record.common_name || record.bird_species,
            historyLabel(record.relationship),
            evidenceStatusLabel(record.evidence_status),
            Array.isArray(record.damage_type) && record.damage_type.length
                ? record.damage_type.join(", ") : "Not documented",
            Array.isArray(record.growth_stages) && record.growth_stages.length
                ? record.growth_stages.map(historyLabel).join(", ") : "Not documented"
        ];
        fields.forEach((value, index) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            if (index === 2) cell.className = `evidence-status evidence-${record.evidence_status || "unknown"}`;
            row.appendChild(cell);
        });

        const sourceCell = document.createElement("td");
        const source = record.source || {};
        if (source.url && source.title) {
            const link = document.createElement("a");
            link.href = source.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = source.title;
            sourceCell.appendChild(link);
        } else if (source.title) {
            sourceCell.textContent = source.title;
        } else {
            sourceCell.textContent = "Source unavailable";
        }
        row.appendChild(sourceCell);

        const classificationCell = document.createElement("td");
        classificationCell.textContent =
            record.evidence_status === "verified" && record.relationship === "pest"
                ? "CONFIRMED PEST"
                : record.evidence_status === "verified"
                    ? historyLabel(record.relationship)
                    : "Pest status unknown";
        classificationCell.className = record.evidence_status === "verified" && record.relationship === "pest"
            ? "evidence-status evidence-pest" : "";
        row.appendChild(classificationCell);
        cropEvidenceList.appendChild(row);
    });
}

function renderCropMonitorDetections(records, cropId, evidenceRecords = []) {
    const body = document.getElementById("crop-monitor-detections");
    const status = document.getElementById("crop-monitor-detections-status");
    if (!body || !status) return;
    body.replaceChildren();
    const detections = [];
    records
        .filter(record => String(record.selected_crop || "").toLowerCase() === cropId.toLowerCase())
        .forEach(record => {
            (Array.isArray(record.predictions) ? record.predictions : []).forEach(prediction => {
                detections.push({ record, prediction });
            });
        });
    if (!detections.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 9;
        cell.textContent = "No saved bird detections for this crop. New results will appear here after analysis.";
        row.appendChild(cell);
        body.appendChild(row);
        status.textContent = `No saved bird detections for ${historyLabel(cropId)}.`;
        return;
    }

    const pendingEvidenceBySpecies = new Map();
    evidenceRecords.forEach(evidence => {
        if (evidence.evidence_status !== "pending") return;
        const scientificName = String(evidence.bird_species || "").toLowerCase();
        if (!scientificName) return;
        if (!pendingEvidenceBySpecies.has(scientificName)) {
            pendingEvidenceBySpecies.set(scientificName, []);
        }
        pendingEvidenceBySpecies.get(scientificName).push({
            relationship: evidence.relationship,
            evidence_status: evidence.evidence_status,
            crop_impact: evidence.impact_description,
            damage_type: evidence.damage_type,
            growth_stages: evidence.growth_stages,
            source: evidence.source
        });
    });

    detections.slice(0, 100).forEach(({ record, prediction }) => {
        const assessment = prediction.crop_assessment || {};
        const savedReviewEvidence = assessment.evidence_status === "pending" &&
            Array.isArray(assessment.unverified_evidence)
            ? assessment.unverified_evidence[0]
            : null;
        const currentEvidence = pendingEvidenceBySpecies.get(
            String(prediction.scientific_name || "").toLowerCase()
        )?.[0];
        const reviewEvidence = savedReviewEvidence ||
            (assessment.evidence_status !== "verified" ? currentEvidence : null);
        const evidenceStatus = assessment.evidence_status === "verified"
            ? "verified"
            : reviewEvidence ? "pending" : assessment.evidence_status;
        const verified = evidenceStatus === "verified";
        const source = (
            Array.isArray(assessment.sources)
                ? assessment.sources.find(item => item.evidence_status === "verified") || assessment.sources[0]
                : null
        ) || reviewEvidence?.source || null;
        const relationship = reviewEvidence
            ? `${historyLabel(reviewEvidence.relationship)} (pending review)`
            : historyLabel(assessment.relationship || "unknown");
        const damageTypes = assessment.damage_type?.length
            ? assessment.damage_type
            : reviewEvidence?.damage_type || [];
        const affectedStages = assessment.affected_growth_stages?.length
            ? assessment.affected_growth_stages
            : reviewEvidence?.growth_stages || [];
        const row = document.createElement("tr");
        const values = [
            prediction.common_name || prediction.scientific_name || "Unknown species",
            Number.isFinite(Number(prediction.confidence))
                ? `${(Number(prediction.confidence) * 100).toFixed(1)}%` : "Unavailable",
            relationship,
            evidenceStatusLabel(evidenceStatus),
            damageTypes.length ? damageTypes.join(", ") : "Not documented",
            affectedStages.length
                ? affectedStages.map(historyLabel).join(", ")
                : "Not documented"
        ];
        values.forEach((value, index) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            if (index === 3) cell.className = `evidence-status evidence-${evidenceStatus || "unknown"}`;
            row.appendChild(cell);
        });
        const sourceCell = document.createElement("td");
        if (source?.url && source.title) {
            const link = document.createElement("a");
            link.href = source.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = source.title;
            sourceCell.appendChild(link);
        } else if (source?.title) {
            sourceCell.textContent = source.title;
        } else {
            sourceCell.textContent = verified ? "Source unavailable" : "No verified source";
        }
        row.appendChild(sourceCell);
        const pestCell = document.createElement("td");
        const confirmedPest = verified &&
            assessment.classification === "pest" &&
            assessment.relationship === "pest";
        pestCell.textContent = confirmedPest
            ? "Confirmed pest"
            : verified && assessment.classification === "non_pest"
                ? "Verified non-pest" : "Pest status unknown";
        pestCell.className = confirmedPest ? "evidence-status evidence-pest" : "";
        row.appendChild(pestCell);
        const riskCell = document.createElement("td");
        riskCell.textContent =
            assessment.risk_assessment_status === "validated" &&
            assessment.pest_risk_percentage != null
                ? `${assessment.pest_risk_percentage}%` : "Not calculated";
        row.appendChild(riskCell);
        body.appendChild(row);
        if (record.growth_stage && !affectedStages.length) {
            row.title = `Recorded at ${historyLabel(record.growth_stage)}; affected-stage evidence unavailable.`;
        }
    });
    status.textContent =
        `Showing ${Math.min(detections.length, 100)} saved detection(s) for ${historyLabel(cropId)}.`;
}

function loadCropEvidence() {
    if (!cropEvidenceList || !cropEvidenceStatus || !cropMonitorCrop) {
        return Promise.resolve();
    }
    const requestedCrop = cropMonitorCrop.value;
    if (!cropEvidenceRequest) {
        cropEvidenceRequest = loadCropEvidenceFromApi(requestedCrop)
            .finally(() => {
                cropEvidenceRequest = null;
                if (cropMonitorCrop.value !== requestedCrop) loadCropEvidence();
            });
    }
    return cropEvidenceRequest;
}

async function loadCropEvidenceFromApi(cropId) {
    if (!cropEvidenceList || !cropEvidenceStatus || !cropMonitorCrop) return;
    cropEvidenceStatus.textContent = "Loading crop-specific evidence…";
    cropEvidenceList.replaceChildren();
    if (!cropId) {
        cropEvidenceStatus.textContent = "Select one of the supported crops to view its evidence.";
        return;
    }
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/crop-evidence?crop_id=${encodeURIComponent(cropId)}`,
            { cache: "no-store" }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Could not load crop evidence.");
        const records = Array.isArray(result.records) ? result.records : [];
        renderCropEvidence(records);
        const counts = records.reduce((total, record) => {
            total[record.evidence_status] = (total[record.evidence_status] || 0) + 1;
            return total;
        }, {});
        cropEvidenceStatus.textContent =
            `${historyLabel(cropId)}${localStorage.getItem("selectedFieldName") ? ` · ${localStorage.getItem("selectedFieldName")}` : ""}: ${records.length} evidence record(s) · ` +
            `${counts.verified || 0} verified · ${counts.pending || 0} pending review · ` +
            `${counts.rejected || 0} rejected · ${counts.unknown || 0} unknown.`;
        try {
            const historyResponse = await fetch(
                `${API_BASE_URL}/api/history?limit=100`,
                { cache: "no-store" }
            );
            const historyResult = await historyResponse.json();
            if (!historyResponse.ok) {
                throw new Error(historyResult.detail || "Could not load saved detections.");
            }
            renderCropMonitorDetections(
                Array.isArray(historyResult.records) ? historyResult.records : [],
                cropId,
                records
            );
        } catch (error) {
            console.error("Crop monitor detection loading error:", error);
            const status = document.getElementById("crop-monitor-detections-status");
            const body = document.getElementById("crop-monitor-detections");
            if (status) status.textContent = `Unable to load saved detections: ${error.message}`;
            if (body) body.replaceChildren();
        }
    } catch (error) {
        console.error("Crop evidence loading error:", error);
        cropEvidenceStatus.textContent = `Unable to load crop evidence: ${error.message}`;
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 7;
        cell.textContent = "Evidence could not be loaded from the backend.";
        row.appendChild(cell);
        cropEvidenceList.appendChild(row);
    }
}

if (cropMonitorCrop) cropMonitorCrop.addEventListener("change", () => saveCropMonitorConfiguration(true));
if (cropMonitorStage) cropMonitorStage.addEventListener("change", () => saveCropMonitorConfiguration(false));
if (cropMonitorField) cropMonitorField.addEventListener("change", () => {
    localStorage.setItem("selectedFieldName", cropMonitorField.value.trim());
});
if (refreshCropEvidenceButton) refreshCropEvidenceButton.addEventListener("click", loadCropEvidence);
syncCropMonitorSelection();

if (manualCropEvidenceForm) {
    manualCropEvidenceForm.addEventListener("submit", async event => {
        event.preventDefault();

        const status = document.getElementById("manual-evidence-form-status");
        const submitButton = manualCropEvidenceForm.querySelector(
            'button[type="submit"]'
        );
        if (!cropMonitorCrop || !cropMonitorCrop.value) {
            if (status) status.textContent = "Select a crop before saving evidence.";
            return;
        }

        const readValue = id =>
            document.getElementById(id)?.value.trim() || "";
        const splitValues = value =>
            value.split(",").map(item => item.trim()).filter(Boolean);
        const year = readValue("manual-evidence-year");
        const payload = {
            crop_id: cropMonitorCrop.value,
            scientific_name: readValue("manual-evidence-scientific-name"),
            common_name: readValue("manual-evidence-common-name"),
            relationship: readValue("manual-evidence-relationship"),
            damage_type: splitValues(readValue("manual-evidence-damage")),
            growth_stages: splitValues(readValue("manual-evidence-stages")),
            impact_description: readValue("manual-evidence-description"),
            source_title: readValue("manual-evidence-source-title"),
            source_url: readValue("manual-evidence-source-url"),
            source_publisher: readValue("manual-evidence-publisher"),
            source_year: year ? Number(year) : null
        };

        if (status) status.textContent = "Saving evidence for review…";
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/crop-evidence`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) {
                const detail = Array.isArray(result.detail)
                    ? result.detail.map(item => item.msg).join("; ")
                    : result.detail;
                throw new Error(detail || "Could not save crop evidence.");
            }

            if (status) {
                status.textContent =
                    `Evidence saved for ${historyLabel(cropMonitorCrop.value)} as pending review. It will not count as verified pest evidence.`;
            }
            manualCropEvidenceForm.reset();
            if (cropEvidenceRequest) await cropEvidenceRequest;
            await loadCropEvidence();
        } catch (error) {
            console.error("Manual crop evidence submission error:", error);
            if (status) {
                status.textContent = `Could not save evidence: ${error.message}`;
            }
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

let dashboardCropEvidenceRequest = null;

function loadDashboardCropEvidence() {
    if (!dashboardCropEvidenceRequest) {
        const requestedCrop = localStorage.getItem("selectedCrop");
        dashboardCropEvidenceRequest = loadDashboardCropEvidenceFromApi(requestedCrop)
            .finally(() => {
                dashboardCropEvidenceRequest = null;
                if (localStorage.getItem("selectedCrop") !== requestedCrop) loadDashboardCropEvidence();
            });
    }
    return dashboardCropEvidenceRequest;
}

async function loadDashboardCropEvidenceFromApi(crop) {
    const countElement = document.getElementById("dashboard-crop-evidence");
    const caption = document.getElementById("dashboard-crop-evidence-caption");
    if (!countElement || !caption) return;
    if (!crop) {
        countElement.textContent = "Not selected";
        caption.textContent = "Choose a crop to review evidence status.";
        return;
    }
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/crop-evidence?crop_id=${encodeURIComponent(crop)}`,
            { cache: "no-store" }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Could not load crop evidence.");
        const records = Array.isArray(result.records) ? result.records : [];
        const verified = records.filter(record => record.evidence_status === "verified").length;
        const pending = records.filter(record => record.evidence_status === "pending").length;
        countElement.textContent = `${verified} verified`;
        caption.textContent = `${historyLabel(crop)} · ${pending} pending of ${records.length} evidence records`;
    } catch (error) {
        console.error("Dashboard crop evidence failed:", error);
        countElement.textContent = "Unavailable";
        caption.textContent = "Could not load crop evidence from the backend.";
    }
}

// =============================================
// LIVE MONITORING STATUS AND DURATION
// =============================================

function formatClockDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
}

function updateLiveSessionMetrics() {
    const started = document.getElementById("live-start-time");
    const duration = document.getElementById("live-duration");
    const analysed = document.getElementById("live-segments-analysed");
    const segmentDuration = document.getElementById("live-segment-duration");
    const lastStart = localStorage.getItem("birdMonitoringStartedAt");
    if (started) {
        started.textContent = liveSessionStartedAt
            ? new Date(liveSessionStartedAt).toLocaleTimeString()
            : lastStart ? new Date(lastStart).toLocaleTimeString() : "—";
    }
    const elapsed = liveSessionElapsedBeforePause +
        (liveSessionStartedAt ? Date.now() - liveSessionStartedAt : 0);
    if (duration) duration.textContent = formatClockDuration(elapsed);
    if (analysed) analysed.textContent = String(liveSessionSegmentsAnalysed);
    if (segmentDuration) {
        const elapsedSegment = liveSegmentStartedAt !== null
            ? Math.min(LIVE_SEGMENT_DURATION_MS, LIVE_SEGMENT_DURATION_MS - liveSegmentRemainingMs + Date.now() - liveSegmentStartedAt)
            : LIVE_SEGMENT_DURATION_MS - liveSegmentRemainingMs;
        const shown = liveMonitoringPaused
            ? LIVE_SEGMENT_DURATION_MS - liveSegmentRemainingMs
            : elapsedSegment;
        segmentDuration.textContent =
            `${String(Math.floor(shown / 1000 / 60)).padStart(2, "0")}:${String(Math.floor(shown / 1000) % 60).padStart(2, "0")} / 00:15`;
    }
    updateDashboardMonitoringState();
}

function updateDashboardMonitoringState() {
    const status = document.getElementById("dashboard-monitoring-status");
    const caption = document.getElementById("dashboard-monitoring-caption");
    if (!status || !caption) return;
    status.textContent = !liveMonitoringActive
        ? liveMonitoringStarting ? "ANALYSING" : liveMonitoringError ? "ERROR"
            : localStorage.getItem("birdMonitoringStartedAt") ? "STOPPED" : "READY"
        : liveMonitoringPaused ? "PAUSED"
            : liveSegmentProcessing ? "ANALYSING" : "LISTENING";
    caption.textContent = liveSessionStartedAt
        ? `Started ${new Date(liveSessionStartedAt).toLocaleTimeString()} · ${formatClockDuration(liveSessionElapsedBeforePause + (liveSessionStartedAt ? Date.now() - liveSessionStartedAt : 0))}`
        : localStorage.getItem("birdMonitoringStartedAt")
            ? "Computer microphone monitoring is stopped"
            : "Ready to start computer microphone monitoring";
}

// =============================================
// SEPARATE BIRD AND VERIFIED-PEST ALERTS
// =============================================

const alertHistoryElement = document.getElementById("alert-history");
const dashboardAlertsElement = document.getElementById("dashboard-recent-alerts");
const alertNotifications = document.getElementById("alert-notifications");
const alertSettingsStatus = document.getElementById("alert-settings-status");
const pestSirenToggle = document.getElementById("pest-siren-enabled");
const alertVolumeInput = document.getElementById("alert-volume");
const alertVolumeValue = document.getElementById("alert-volume-value");
const alertCooldownSelect = document.getElementById("alert-cooldown");
const activeAlertEventIds = new Set();
const lastAlertSoundAt = new Map();
let alertAudioContext = null;
let alertSoundPlaying = false;
let alertPlaybackQueue = Promise.resolve();
let alertHistory = [];

try {
    const savedAlerts = JSON.parse(localStorage.getItem("birdGuardAlertHistory") || "[]");
    if (Array.isArray(savedAlerts)) alertHistory = savedAlerts.slice(0, 50);
} catch (error) {
    console.warn("Saved alert history could not be read:", error);
}

function persistAlertHistory() {
    try {
        localStorage.setItem("birdGuardAlertHistory", JSON.stringify(alertHistory.slice(0, 50)));
    } catch (error) {
        console.error("Alert history could not be saved:", error);
        if (alertSettingsStatus) alertSettingsStatus.textContent = "Alert history could not be saved in this browser.";
    }
}

function initializeAlertSettings() {
    if (pestSirenToggle) pestSirenToggle.checked = localStorage.getItem("pestSirenEnabled") !== "false";
    if (alertVolumeInput) alertVolumeInput.value = localStorage.getItem("birdAlertVolume") || "85";
    if (alertCooldownSelect) alertCooldownSelect.value = localStorage.getItem("birdAlertCooldown") || "30";
    if (alertVolumeValue && alertVolumeInput) alertVolumeValue.textContent = `${alertVolumeInput.value}%`;
    localStorage.removeItem("birdAlertsMutedUntil");
}

function makeAlertAudioContext() {
    if (!alertAudioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error("Web Audio is not supported by this browser.");
        alertAudioContext = new AudioContextClass();
    }
    return alertAudioContext;
}

async function playAlertSiren(type) {
    const context = makeAlertAudioContext();
    if (context.state === "suspended") await context.resume();
    if (alertSoundPlaying) return false;
    alertSoundPlaying = true;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const volume = Number(alertVolumeInput?.value ?? 85) / 100;
    const start = context.currentTime;
    const sirenDuration = type === "pest" ? 1.8 : 2.6;
    const peakGain = Math.min(0.8, Math.max(0, volume) * 0.8);
    const lowFrequency = type === "pest" ? 520 : 650;
    const highFrequency = type === "pest" ? 900 : 1200;
    const sweepDuration = type === "pest" ? 0.45 : 0.65;

    oscillator.type = "triangle";
    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(
        Math.max(0.0001, peakGain),
        start + 0.04
    );
    oscillator.frequency.setValueAtTime(lowFrequency, start);

    for (let sweepStart = 0; sweepStart < sirenDuration; sweepStart += sweepDuration * 2) {
        const lowTime = start + sweepStart;
        const highTime = Math.min(
            start + sirenDuration,
            lowTime + sweepDuration
        );
        const nextLowTime = Math.min(
            start + sirenDuration,
            highTime + sweepDuration
        );
        oscillator.frequency.linearRampToValueAtTime(highFrequency, highTime);
        oscillator.frequency.linearRampToValueAtTime(lowFrequency, nextLowTime);
    }

    gain.gain.setValueAtTime(
        Math.max(0.0001, peakGain),
        start + sirenDuration - 0.05
    );
    gain.gain.linearRampToValueAtTime(0.0001, start + sirenDuration);
    return new Promise(resolve => {
        oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
            alertSoundPlaying = false;
            resolve(true);
        };
        oscillator.start(start);
        oscillator.stop(start + sirenDuration + 0.02);
    });
}

function addAlertHistoryEntry(entry) {
    alertHistory.unshift(entry);
    alertHistory = alertHistory.slice(0, 50);
    persistAlertHistory();
    renderAlertHistory();
}

function renderAlertCard(entry, includeActions = false) {
    const item = document.createElement("article");
    item.className = `overview-event alert-event ${entry.type === "pest" ? "alert-event-pest" : "alert-event-bird"}`;
    const title = document.createElement("strong");
    title.textContent = entry.type === "pest" ? "CROP PEST ALERT" : "BIRD DETECTED";
    const detail = document.createElement("span");
    detail.textContent = entry.type === "pest"
        ? `${entry.birdName} · ${entry.cropName} · ${entry.damageType} · ${entry.evidenceSource}`
        : `${entry.birdName} (${entry.scientificName}) · ${entry.confidence}% confidence`;
    const time = document.createElement("time");
    time.textContent = new Date(entry.timestamp).toLocaleString();
    item.append(title, detail, time);
    if (entry.acknowledged) {
        const state = document.createElement("small");
        state.textContent = entry.dismissed ? "Dismissed" : "Acknowledged";
        item.appendChild(state);
    }
    if (includeActions && !entry.acknowledged) {
        const actions = document.createElement("div");
        actions.className = "alert-entry-actions";
        [["Acknowledge", false], ["Dismiss", true]].forEach(([label, dismissed]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "module-link";
            button.textContent = label;
            button.addEventListener("click", () => {
                entry.acknowledged = true;
                entry.dismissed = dismissed;
                persistAlertHistory();
                renderAlertHistory();
            });
            actions.appendChild(button);
        });
        item.appendChild(actions);
    }
    return item;
}

function renderAlertHistory() {
    [alertHistoryElement, dashboardAlertsElement].forEach((container, index) => {
        if (!container) return;
        container.replaceChildren();
        const visible = alertHistory.slice(0, index === 0 ? 20 : 5);
        if (!visible.length) {
            const empty = document.createElement("p");
            empty.className = "status-message";
            empty.textContent = "No alerts recorded in this browser.";
            container.appendChild(empty);
            return;
        }
        visible.forEach(entry => container.appendChild(renderAlertCard(entry, index === 0)));
    });
}

function showAlertNotification(
    entry,
    soundEnabled,
    alertOutput,
    soundSuppressionReason = null
) {
    if (!alertNotifications) return;
    const notification = renderAlertCard(entry);
    notification.classList.add("alert-toast");
    const message = document.createElement("p");
    message.textContent = entry.type === "pest"
        ? `Bird: ${entry.birdName} · Crop: ${entry.cropName} · Growth stage: ${entry.growthStage} · Verified evidence: ${entry.evidenceSource} · Documented damage: ${entry.damageType} · Pest classification: confirmed`
        : `Bird: ${entry.birdName} · Scientific name: ${entry.scientificName} · Confidence: ${entry.confidence}% · Detected: ${new Date(entry.timestamp).toLocaleTimeString()} · Identification successful`;
    notification.appendChild(message);
    const actions = document.createElement("div");
    actions.className = "alert-entry-actions";
    [["Acknowledge", false], ["Dismiss", true]].forEach(([label, dismissed]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => {
            entry.acknowledged = true;
            entry.dismissed = dismissed;
            persistAlertHistory();
            renderAlertHistory();
            notification.remove();
        });
        actions.appendChild(button);
    });
    notification.appendChild(actions);
    if (!soundEnabled && alertOutput === "laptop" && soundSuppressionReason) {
        const note = document.createElement("small");
        note.textContent = soundSuppressionReason;
        notification.appendChild(note);
    }
    alertNotifications.prepend(notification);
    while (alertNotifications.children.length > 4) {
        alertNotifications.lastElementChild.remove();
    }
    window.setTimeout(() => notification.remove(), 15000);
}

function createDetectionAlert(type, prediction, result) {
    const assessment = prediction.crop_assessment || {};
    const cropNamesForAlerts = {
        rice: "Rice", maize: "Maize", vegetables: "Vegetables",
        sugarcane: "Sugarcane", groundnut: "Groundnut", wheat: "Wheat",
        cotton: "Cotton", millet: "Millet"
    };
    const verifiedSource = Array.isArray(assessment.sources)
        ? assessment.sources.find(source => source.evidence_status === "verified")
        : null;
    const damages = Array.isArray(assessment.damage_type) ? assessment.damage_type : [];
    return {
        id: `${type}-${result.recording_id || Date.now()}-${prediction.scientific_name}`,
        type,
        birdName: prediction.common_name || prediction.scientific_name || "Unknown bird",
        scientificName: prediction.scientific_name || "Unknown",
        confidence: (Number(prediction.confidence) * 100).toFixed(1),
        cropName: cropNamesForAlerts[result.selected_crop] || historyLabel(result.selected_crop),
        growthStage: historyLabel(result.growth_stage || localStorage.getItem("selectedGrowthStage")),
        evidenceSource: verifiedSource?.title || "Verified agricultural record",
        evidenceUrl: verifiedSource?.url || "",
        damageType: damages.length ? damages.join(", ") : "Not documented",
        timestamp: new Date().toISOString(),
        acknowledged: false,
        dismissed: false
    };
}

function alertSirenEnabled(type) {
    return type === "pest"
        ? localStorage.getItem("pestSirenEnabled") !== "false"
        : true;
}

function handleDetectionAlerts(result) {
    const alertOutput = result.alert_output || getSelectedAlertOutput();
    const minimumConfidence = getMinimumConfidence() / 100;
    const predictions = Array.isArray(result.predictions) ? result.predictions : [];
    const candidates = predictions.filter(prediction =>
        prediction.scientific_name &&
        Number.isFinite(Number(prediction.confidence)) &&
        Number(prediction.confidence) >= minimumConfidence
    );
    candidates.forEach(prediction => {
        const assessment = prediction.crop_assessment || {};
        const confirmedPest =
            assessment.classification === "pest" &&
            assessment.relationship === "pest" &&
            assessment.evidence_status === "verified" &&
            Array.isArray(assessment.sources) &&
            assessment.sources.some(source => source.evidence_status === "verified");
        const alerts = [createDetectionAlert("bird", prediction, result)];
        if (confirmedPest) alerts.push(createDetectionAlert("pest", prediction, result));
        alerts.forEach(entry => {
            if (activeAlertEventIds.has(entry.id)) return;
            activeAlertEventIds.add(entry.id);
            if (activeAlertEventIds.size > 500) {
                activeAlertEventIds.delete(activeAlertEventIds.values().next().value);
            }
            addAlertHistoryEntry(entry);
            const cooldownMs = Number(alertCooldownSelect?.value || 0) * 1000;
            const speciesKey = `${entry.type}:${entry.scientificName}`;
            const lastPlayed = lastAlertSoundAt.get(speciesKey) || 0;
            const alertStatus = result.buzzer_alert?.status;
            const serverQualifiedBird =
                entry.type === "bird" &&
                entry.scientificName === result.buzzer_alert?.species &&
                ((alertOutput === "arduino" && alertStatus === "queued") ||
                    (alertOutput === "laptop" && alertStatus === "laptop_sound"));
            const canPlay = entry.type === "bird"
                ? serverQualifiedBird
                : alertOutput === "laptop" && alertSirenEnabled(entry.type);
            const isInLaptopCooldown =
                canPlay &&
                alertOutput === "laptop" &&
                Date.now() - lastPlayed < cooldownMs;
            if (canPlay && !isInLaptopCooldown) {
                showAlertNotification(entry, true, alertOutput);
            }
            if (canPlay && !isInLaptopCooldown) {
                lastAlertSoundAt.set(speciesKey, Date.now());
                if (alertOutput === "laptop") {
                    alertPlaybackQueue = alertPlaybackQueue.then(() =>
                        playAlertSiren(entry.type)
                    ).catch(error => {
                        console.error("Alert siren playback failed:", error);
                        if (alertSettingsStatus) alertSettingsStatus.textContent = `Alert sound could not play: ${error.message}`;
                    });
                }
            }
        });
    });
}

function setAlertStatus(message) {
    if (alertSettingsStatus) alertSettingsStatus.textContent = message;
}

function initializeAlertControls() {
    initializeAlertSettings();
    if (pestSirenToggle) pestSirenToggle.addEventListener("change", () => {
        localStorage.setItem("pestSirenEnabled", String(pestSirenToggle.checked));
    });
    if (alertVolumeInput) alertVolumeInput.addEventListener("input", () => {
        localStorage.setItem("birdAlertVolume", alertVolumeInput.value);
        if (alertVolumeValue) alertVolumeValue.textContent = `${alertVolumeInput.value}%`;
    });
    if (alertCooldownSelect) alertCooldownSelect.addEventListener("change", () => {
        localStorage.setItem("birdAlertCooldown", alertCooldownSelect.value);
    });
    document.getElementById("test-bird-siren")?.addEventListener("click", async () => {
        try {
            alertPlaybackQueue = alertPlaybackQueue.then(() => playAlertSiren("bird"));
            await alertPlaybackQueue;
            setAlertStatus("Bird detection siren test played.");
        } catch (error) {
            console.error("Bird siren test failed:", error);
            setAlertStatus(`Bird siren test failed: ${error.message}`);
        }
    });
    document.getElementById("test-pest-siren")?.addEventListener("click", async () => {
        try {
            alertPlaybackQueue = alertPlaybackQueue.then(() => playAlertSiren("pest"));
            await alertPlaybackQueue;
            setAlertStatus("Crop pest siren test played.");
        } catch (error) {
            console.error("Crop pest siren test failed:", error);
            setAlertStatus(`Crop pest siren test failed: ${error.message}`);
        }
    });
    renderAlertHistory();
}

initializeAlertControls();
updateLiveSessionMetrics();
updateDashboardMonitoringState();
