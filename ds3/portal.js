const content = document.querySelector("#content");
const status = document.querySelector("#status");
const query = new URLSearchParams(location.search);

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

const link = (text, href) => element("a", { href }, text);
const card = (...children) => element("section", { class: "card" }, ...children);
const paragraph = text => element("p", {}, text);
const buttonLink = (text, href, primary = false) =>
  element("a", { href, class: primary ? "button-link primary" : "button-link" }, text);
const permitSteps = ["About you", "Permit", "Vehicle", "Review", "Confirmation"];

function progress(current, onNavigate, furthest = current) {
  return element("ol", { class: "progress", "aria-label": "Permit application steps" },
    ...permitSteps.map((step, index) => {
      const stepNumber = index + 1;
      const marker = element("span", { "aria-hidden": "true" }, String(stepNumber));
      const attributes = stepNumber === current ? { "aria-current": "step" } : {};
      const label = onNavigate && stepNumber <= furthest && stepNumber !== current
        ? element("button", {
          type: "button",
          class: "progress-step",
          "aria-label": "Go to " + step + ", step " + stepNumber,
        }, marker, step)
        : [marker, step];
      const item = element("li", attributes);
      if (Array.isArray(label)) item.append(...label);
      else {
        label.addEventListener("click", () => onNavigate(stepNumber));
        item.append(label);
      }
      return item;
    }));
}

const heading = text => element("h2", { tabindex: "-1" }, text);
const action = (text, handler, secondary = false) => {
  const button = element("button", { type: "button", ...(secondary ? { class: "secondary" } : {}) }, text);
  button.addEventListener("click", handler);
  return button;
};

async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === "string" ? error.detail : "Try again or check the information you entered.");
  }
  return response.json();
}

function field(label, control, hint = "") {
  const error = element("p", { id: control.id + "-error", class: "error" });
  const description = element("p", { id: control.id + "-hint" }, hint);
  control.setAttribute("aria-describedby", [hint && description.id, error.id].filter(Boolean).join(" "));
  const wrapper = control.type === "checkbox"
    ? element("div", { class: "field" }, element("label", { for: control.id }, control, " " + label))
    : element("div", { class: "field" }, element("label", { for: control.id }, label), control);
  if (hint) wrapper.append(description);
  wrapper.append(error);
  return wrapper;
}

function select(id, choices, value, placeholder = "Choose an option") {
  const input = element("select", { id, required: "" }, element("option", { value: "" }, placeholder));
  for (const [key, label] of choices) input.append(element("option", { value: key }, label));
  input.value = value || "";
  return input;
}

function radioGroup(id, label, choices, value, hint, className = "") {
  const hintId = id + "-hint";
  const errorId = id + "-error";
  const options = choices.map(([key, text], index) => {
    const input = element("input", {
      type: "radio",
      id: index === 0 ? id : id + "-" + key,
      name: id,
      value: key,
      ...(index === 0 ? { required: "" } : {}),
    });
    input.checked = key === value;
    input.setAttribute("aria-describedby", hintId + " " + errorId);
    return element("label", {}, input, " " + text);
  });
  return element("fieldset", { class: ["field", "radio-group", className].filter(Boolean).join(" ") },
    element("legend", {}, label),
    element("p", { id: hintId }, hint), ...options,
    element("p", { id: errorId, class: "error" }));
}

function validate(form) {
  const controls = [...form.elements].filter(control => control.willValidate && control.id);
  let firstInvalid;
  for (const control of controls) {
    const error = document.getElementById(control.id + "-error");
    if (!error) continue;
    const invalid = !control.checkValidity();
    error.textContent = invalid ? control.validationMessage : "";
    if (invalid) {
      control.setAttribute("aria-invalid", "true");
      firstInvalid ??= control;
    } else {
      control.removeAttribute("aria-invalid");
    }
  }
  firstInvalid?.focus();
  return !firstInvalid;
}

function showStep(title, body, moveFocus, onNavigate, furthest) {
  const titleNode = heading(title);
  const step = Number(title.match(/^Step (\d+)/)?.[1]);
  content.replaceChildren(progress(step, onNavigate, furthest), card(titleNode, body));
  if (moveFocus) titleNode.focus();
}

  function formFor(handler, label = "Continue") {
    const form = element("form", { novalidate: "" });
    const submit = element("button", { type: "submit" }, label);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (submit.disabled || !validate(form)) return;
      submit.disabled = true;
      status.textContent = "";
      try {
        await handler();
      } catch (error) {
        status.textContent = error.message;
        submit.disabled = false;
        submit.focus();
      } finally {
        submit.disabled = false;
      }
    });
    return { form, submit };
  }

async function permits() {
  const { residences, commuter_rule: commuterRule } = await api("/ds3/permit-form-options");
  const draftKey = "ds3-permit-application-draft";
  const answers = { name: "", residence: "", year: "", commuter_eligible: false };
  const vehicle = { plate: "", state: "" };
  let selectedCampusResidence = "";
  const campusResidences = Object.entries(residences)
    .filter(([key]) => key !== "off_campus")
    .flatMap(([region, label]) => {
      const separator = label.indexOf(":");
      const halls = separator < 0 ? [label] : label.slice(separator + 1).split(",");
      return halls.map(hall => hall.trim()).filter(Boolean)
        .map(hall => [region + "|" + hall, hall]);
    })
    .sort(([, firstHall], [, secondHall]) => firstHall.localeCompare(secondHall));
  let matches = [];
  let chosen;
  let request;
  let currentStep = "about";
  let returnToReview = false;
  let furthestStep = 1;
  let savedDraft;
  let reviewedKey = "";

  const storedDraft = sessionStorage.getItem(draftKey);
  if (storedDraft) {
    try {
      savedDraft = JSON.parse(storedDraft);
    } catch {
      sessionStorage.removeItem(draftKey);
      status.textContent = "Saved permit progress could not be restored. Please start again.";
    }
  }
  if (savedDraft?.version === 1) {
    if (typeof savedDraft.answers?.name === "string") answers.name = savedDraft.answers.name;
    if (Object.hasOwn(residences, savedDraft.answers?.residence)) answers.residence = savedDraft.answers.residence;
    if (["freshman", "continuing"].includes(savedDraft.answers?.year)) answers.year = savedDraft.answers.year;
    if (typeof savedDraft.answers?.commuter_eligible === "boolean") {
      answers.commuter_eligible = savedDraft.answers.commuter_eligible;
    }
    if (typeof savedDraft.vehicle?.plate === "string") vehicle.plate = savedDraft.vehicle.plate;
    if (typeof savedDraft.vehicle?.state === "string") vehicle.state = savedDraft.vehicle.state;
    if (typeof savedDraft.selectedCampusResidence === "string" &&
        campusResidences.some(([value]) => value === savedDraft.selectedCampusResidence)) {
      selectedCampusResidence = savedDraft.selectedCampusResidence;
    }
    if (["about", "options", "vehicle", "review"].includes(savedDraft.step)) currentStep = savedDraft.step;
    returnToReview = savedDraft.returnToReview === true;
    if (Number.isInteger(savedDraft.furthestStep)) {
      furthestStep = Math.max(1, Math.min(4, savedDraft.furthestStep));
    }
    furthestStep = Math.max(furthestStep, {
      about: 1,
      options: 2,
      vehicle: 3,
      review: 4,
    }[currentStep]);
    if (savedDraft.request && typeof savedDraft.request.key === "string" &&
        typeof savedDraft.request.id === "string") request = savedDraft.request;
  }

  function persistDraft(step = currentStep) {
    currentStep = step;
    sessionStorage.setItem(draftKey, JSON.stringify({
      version: 1,
      step: currentStep,
      furthestStep,
      returnToReview,
      answers,
      vehicle,
      selectedCampusResidence,
      chosenPermitId: chosen?.id,
      request,
    }));
  }


  function navigatePermitStep(stepNumber) {
    returnToReview = false;
    if (stepNumber === 1) about(true);
    else if (stepNumber === 2) options();
    else if (stepNumber === 3) vehicleStep();
    else if (stepNumber === 4 && furthestStep >= 4) review();
  }

  function about(moveFocus = true, resumeReview = false) {
    returnToReview = resumeReview;
    persistDraft("about");
    const name = element("input", { id: "name", autocomplete: "name", maxlength: "100", required: "" });
    name.value = answers.name;
    name.addEventListener("input", () => {
      name.setCustomValidity("");
      answers.name = name.value;
      persistDraft();
    });
    const residence = radioGroup("residence", "Where do you live?",
      [["off_campus", "Off campus"], ["on_campus", "On campus"]],
      answers.residence === "off_campus" ? "off_campus" : answers.residence ? "on_campus" : "",
      "Your answer will be used to determine permit eligibility. Choose whether you live on or off campus.");
    const campusResidence = select("campus-residence",
      campusResidences,
      selectedCampusResidence,
      "Search for your residence hall");
    campusResidence.addEventListener("change", () => {
      selectedCampusResidence = campusResidence.value;
    });
    const campusResidenceField = field("Residence hall", campusResidence, "Start typing or select from the list.");
    const year = radioGroup("year", "Student year",
      [["freshman", "Freshman"], ["continuing", "Sophomore, junior, senior, or graduate student"]], answers.year,
      "Choose the group that includes your current year. Sophomore, junior, senior, and graduate students share the same permit eligibility rules in this application.");
    const commuter = element("input", { type: "checkbox", id: "commuter" });
    commuter.checked = answers.commuter_eligible;
    const commuterField = element("div", { class: "field" },
      element("label", {}, commuter, " I live off campus and meet the commuter requirements"),
      paragraph(commuterRule));
    function updateResidenceFields() {
      const location = residence.querySelector("input:checked")?.value;
      campusResidenceField.hidden = location !== "on_campus";
      campusResidence.disabled = location !== "on_campus";
      campusResidence.required = location === "on_campus";
      commuterField.hidden = location !== "off_campus";
      if (commuterField.hidden) commuter.checked = false;
      answers.residence = location === "off_campus" ? "off_campus"
        : location === "on_campus" && selectedCampusResidence
          ? selectedCampusResidence.split("|")[0]
          : "";
      answers.commuter_eligible = commuter.checked;
      persistDraft();
    }
    residence.addEventListener("change", updateResidenceFields);
    campusResidence.addEventListener("change", () => {
      selectedCampusResidence = campusResidence.value;
      if (residence.querySelector("input:checked")?.value === "on_campus") {
        answers.residence = selectedCampusResidence.split("|")[0];
      }
      persistDraft();
    });
    year.addEventListener("change", () => {
      answers.year = year.querySelector("input:checked")?.value || "";
      persistDraft();
    });
    commuter.addEventListener("change", () => {
      answers.commuter_eligible = commuter.checked;
      persistDraft();
    });
    updateResidenceFields();
    const { form, submit } = formFor(async () => {
      const location = residence.querySelector("input:checked")?.value;
      Object.assign(answers, {
        name: name.value.trim(),
        residence: location === "off_campus" ? "off_campus" : campusResidence.value.split("|")[0],
        year: year.querySelector("input:checked")?.value || "",
        commuter_eligible: commuter.checked,
      });
      if (!answers.name) {
        name.setCustomValidity("Enter your name.");
        validate(form);
        return;
      }
      matches = await api("/permit-matches", answers);
      furthestStep = Math.max(furthestStep, 2);
      const chosenStillMatches = matches.some(permit => permit.id === chosen?.id);
      if (!chosenStillMatches) chosen = undefined;
      persistDraft("options");
      if (returnToReview && chosenStillMatches) review();
      else options(returnToReview);
    });
    form.append(field("Your name", name, "Enter the name associated with your UNH student record, for example: Jane Doe."),
      residence, commuterField, campusResidenceField, year, submit);
    showStep("Step 1 of 5: About you", form, moveFocus, navigatePermitStep, furthestStep);
  }

  function options(returnToReview = false) {
    returnToReview &&= furthestStep >= 4;
    persistDraft("options");
    if (!matches.length) {
      const explanation = answers.year === "freshman" && answers.residence !== "off_campus"
        ? "The academic-year student permits have no match for freshmen who live on campus. Off-campus freshmen may qualify for other options."
        : "No academic-year student permits match these answers.";
      showStep("Step 2 of 5: No matching permits", element("div", {}, paragraph(explanation),
        element("div", { class: "actions" }, action("Edit about you", () => about()),
          link("Parking Help for permits", "/ds3/help#permits"))), true, navigatePermitStep, furthestStep);
      return;
    }
    const picker = radioGroup("permit", "Choose your permit type",
      matches.map(permit => [permit.id, permit.name + " - $" + permit.price + (permit.lottery_required ? " (lottery)" : "")]), chosen?.id,
      "Select a permit to continue.", "choice-cards");
    const allocation = element("div", {"aria-live": "polite"});
    const updateAllocation = () => allocation.replaceChildren(...(chosen?.lottery_required ? [lotteryNotice(chosen)] : []));
    updateAllocation();
    picker.addEventListener("change", () => {
      chosen = matches.find(permit => permit.id === Number(picker.querySelector("input:checked")?.value));
      updateAllocation();
      persistDraft();
    });
    const { form, submit } = formFor(() => {
      chosen = matches.find(permit => permit.id === Number(picker.querySelector("input:checked")?.value));
      furthestStep = Math.max(furthestStep, 3);
      persistDraft();
      if (returnToReview) review();
      else vehicleStep();
    });
    form.append(picker, allocation,
      element("div", { class: "actions" }, action("Back", () => about(true, returnToReview)), submit));
    showStep("Step 2 of 5: Permit", form, true, navigatePermitStep, furthestStep);
  }

  async function vehicleStep(fromReview = false) {
    returnToReview = fromReview;
    persistDraft("vehicle");
    const plate = element("input", { id: "plate", required: "", maxlength: "10", pattern: "[A-Za-z0-9][A-Za-z0-9 \\-]*" });
    const state = element("input", { id: "state", required: "", maxlength: "2", pattern: "[A-Za-z]{2}" });
    plate.value = vehicle.plate;
    state.value = vehicle.state;
    const saveVehicleDraft = () => {
      vehicle.plate = plate.value;
      vehicle.state = state.value;
      persistDraft();
    };
    plate.addEventListener("input", saveVehicleDraft);
    state.addEventListener("input", saveVehicleDraft);
    const { form, submit } = formFor(() => {
      Object.assign(vehicle, { plate: plate.value.trim().toUpperCase(), state: state.value.toUpperCase() });
      furthestStep = Math.max(furthestStep, 4);
      persistDraft("review");
      review();
    });
    const requiredVehicle = chosen.vehicle_requirement;
    const requiredVehicleLabel = requiredVehicle[0].toUpperCase() + requiredVehicle.slice(1);
    form.append(element("aside", { class: "vehicle-requirement", "aria-labelledby": "vehicle-requirement-title" },
        element("h3", { id: "vehicle-requirement-title" }, "Important"),
        paragraph("Selected permit: " + chosen.name),
        paragraph("Vehicle required: " + requiredVehicleLabel),
        paragraph("Enter the " + requiredVehicle + "'s information below.")),
      field("License plate", plate, "Enter the license plate as shown on the vehicle registration, for example: ABC-1234."),
      field("State", state, "Enter the two-letter state code shown on the vehicle registration, for example: NH."),
      element("div", { class: "actions" },
        action("Back", () => fromReview ? review() : options()), submit));
    const saved = (await api("/vehicles").catch(() => { status.textContent = "Saved vehicles could not be loaded. You can still enter vehicle details manually."; return []; })).filter(item => item.vehicle_type === chosen.vehicle_requirement);
    const picker = select("saved-vehicle", saved.map(item => [item.id, item.plate + " / " + item.state]), "", "Enter manually or choose a saved vehicle");
    picker.required = false;
    picker.addEventListener("change", () => {
      const selected = saved.find(item => item.id === picker.value);
      if (selected) { plate.value = selected.plate; state.value = selected.state; saveVehicleDraft(); }
    });
    form.prepend(field("Saved vehicle (optional)", picker, "Only vehicles matching this permit's required type are shown."), link("Manage saved vehicles", "/ds3/vehicles"));
    showStep("Step 3 of 5: Vehicle", form, true, navigatePermitStep, furthestStep);
  }

  function review() {
    returnToReview = false;
    persistDraft("review");
    const currentReviewKey = JSON.stringify({ answers, vehicle, permit: chosen.id });
    const confirm = element("input", { id: "reviewed", type: "checkbox", required: "" });
    confirm.checked = reviewedKey === currentReviewKey;
    confirm.addEventListener("change", () => { reviewedKey = confirm.checked ? currentReviewKey : ""; });
    const residenceSummary = answers.residence === "off_campus"
      ? "Off campus"
      : selectedCampusResidence.split("|").slice(1).join("|");
    const { form, submit } = formFor(async () => {
      const payload = { applicant: { ...answers }, vehicle: { ...vehicle, vehicle_type: chosen.vehicle_requirement }, permit_type_id: chosen.id };
      const key = JSON.stringify(payload);
      if (request?.key !== key) request = { key, id: crypto.randomUUID() };
      persistDraft("review");
      let record;
      try {
        record = await api("/applications", { ...payload, request_id: request.id });
      } catch (error) {
        if (error.message !== "An application for this permit and vehicle is already under review") throw error;
        const applications = await api("/applications");
        const existing = applications.find(application =>
          application.status === "under_review" &&
          application.permit_type_id === chosen.id &&
          application.vehicle.plate === payload.vehicle.plate &&
          application.vehicle.state === payload.vehicle.state);
        if (!existing) throw error;
        submitArea.replaceChildren(element("section", {
          class: "duplicate-application",
          role: "alert",
          "aria-labelledby": "duplicate-application-title",
        },
        element("h3", { id: "duplicate-application-title", tabindex: "-1" }, "Duplicate application found"),
        paragraph("You already have an application under review for:"),
        paragraph("Permit: " + existing.permit_type_name),
        paragraph("License Plate: " + existing.vehicle.plate + " (" + existing.vehicle.state + ")"),
        paragraph("You cannot submit another application with the same permit and vehicle while this application is being reviewed."),
        link("View existing application", "/ds3/my-parking#" + encodeURIComponent(existing.id))));
        submitArea.querySelector("h3").focus();
        return;
      }
      sessionStorage.removeItem(draftKey);
      const applicationStatus = ({ under_review: "Pending Review", withdrawn: "Withdrawn" })[record.status] || record.status;
      const applicationResidence = record.applicant.residence === "off_campus"
        ? "Off campus"
        : selectedCampusResidence.split("|").slice(1).join("|");
      showStep("Step 5 of 5: Application received", element("div", {},
        element("div", { class: "review-summary confirmation-summary" },
          element("section", { class: "review-card confirmation-number-card", "aria-labelledby": "confirmation-number-title" },
            element("h3", { id: "confirmation-number-title" }, "Confirmation Number"),
            element("p", { class: "confirmation-number" }, record.id)),
          element("section", { class: "review-card", "aria-labelledby": "confirmation-permit-title" },
            element("h3", { id: "confirmation-permit-title" }, "Permit"),
            paragraph(record.permit_type_name)),
          element("section", { class: "review-card", "aria-labelledby": "confirmation-applicant-title" },
            element("h3", { id: "confirmation-applicant-title" }, "Applicant"),
            paragraph("Name: " + record.applicant.name),
            paragraph("Residence: " + applicationResidence)),
          element("section", { class: "review-card", "aria-labelledby": "confirmation-vehicle-title" },
            element("h3", { id: "confirmation-vehicle-title" }, "Vehicle"),
            paragraph("License Plate: " + record.vehicle.plate + " - " + record.vehicle.state)),
          element("section", { class: "review-card confirmation-status-card", "aria-labelledby": "confirmation-status-title" },
            element("h3", { id: "confirmation-status-title" }, "Status"),
            element("p", { class: "confirmation-status" }, applicationStatus))),
        element("aside", { class: "parking-warning", "aria-label": "Important parking restriction" },
          element("h3", {}, "Important"),
          element("strong", {}, "Do not park on campus until your permit has been approved.")),
        ...(chosen.lottery_required ? [lotteryNotice(chosen)] : []),
        element("section", { class: "next-steps", "aria-labelledby": "confirmation-next-steps-title" },
          element("h3", { id: "confirmation-next-steps-title" }, "Next Steps"),
          element("ul", {},
            element("li", {}, link("View your application in My Applications",
              "/ds3/my-parking#" + encodeURIComponent(record.id))),
            element("li", {}, "Check your application status."),
            element("li", {}, "Withdraw an incorrect application if necessary.")))), true);
    }, "Submit application");
    const submitArea = element("div", { class: "actions submit-actions" }, submit);
    form.append(paragraph("Review your application below. You can still make changes before submitting."),
      element("div", { class: "review-summary" },
        element("section", { class: "review-card", "aria-labelledby": "review-permit-title" },
          element("h3", { id: "review-permit-title" }, "Permit"),
          paragraph(chosen.name),
          paragraph("Permit cost: $" + chosen.price),
          paragraph(chosen.eligibility_reason),
          element("div", { class: "review-card-actions" }, action("Edit Permit", () => options(true)))),
        element("section", { class: "review-card", "aria-labelledby": "review-applicant-title" },
          element("h3", { id: "review-applicant-title" }, "Applicant"),
          paragraph("Name: " + answers.name),
          paragraph("Residence: " + residenceSummary),
          element("div", { class: "review-card-actions" }, action("Edit Applicant Information", () => about(true, true)))),
        element("section", { class: "review-card", "aria-labelledby": "review-vehicle-title" },
          element("h3", { id: "review-vehicle-title" }, "Vehicle"),
          paragraph("License Plate: " + vehicle.plate),
          paragraph("State: " + vehicle.state),
          element("div", { class: "review-card-actions" }, action("Edit Vehicle Information", () => vehicleStep(true))))),
      element("section", { class: "next-steps", "aria-labelledby": "next-steps-title" },
        element("h3", { id: "next-steps-title" }, "What happens next?"),
        element("ol", {},
          element("li", {}, "Your application will be submitted for review."),
          element("li", {}, "Check your application status for the review outcome."),
          element("li", {}, "You can view your application status in My Applications."))),
      element("aside", { class: "parking-warning", "aria-label": "Important parking restriction" },
        element("h3", {}, "Important"),
        element("strong", {}, "Do not park on campus until your permit has been approved.")),
      ...(chosen.lottery_required ? [lotteryNotice(chosen)] : []),
      field("I reviewed the permit and vehicle details", confirm), submitArea);
    showStep("Step 4 of 5: Review", form, true, navigatePermitStep, furthestStep);
  }

  content.before(contextHelp("permit", "Your residence and student year determine which permits appear. You can edit your answers before submitting."));
  if (!savedDraft || currentStep === "about") {
    about(false);
    return;
  }
  matches = await api("/permit-matches", answers);
  chosen = matches.find(permit => permit.id === savedDraft.chosenPermitId);
  if (currentStep === "options" || !chosen) options(returnToReview);
  else if (currentStep === "vehicle") await vehicleStep(returnToReview);
  else review();
}

function lotteryNotice(permit) {
  return element("aside", {class: "lottery-notice", "aria-label": "Lottery allocation"},
    element("h3", {}, "Lottery allocation"),
    paragraph("UNH allocates " + permit.name + " permits through a lottery. Spaces are limited and a waitlist may apply; selection is not guaranteed."),
    paragraph("Follow UNH's enrollment instructions to enter the lottery. Submitting an application here does not enroll you in the UNH lottery."),
    link("Check UNH lottery instructions and enrollment dates", permit.lottery_url));
}

const mapFiles = [
  "commuter.jpg", "resident-core.jpg", "resident-core.jpg", "resident-core.jpg", "resident-core.jpg",
  "resident-west.jpg", "resident-west.jpg", "motorcycle-moped.jpg", "motorcycle-moped.jpg",
];

async function coverage(preview, container = content) {
  const permits = await api("/permit-types");
  const picker = select("map-permit", permits.map(permit => [permit.id, permit.name]), query.get("permit_id"),
    "Choose a permit type");
  const results = element("div");
  const form = element("form", { novalidate: "" }, field("Permit type", picker),
    element("button", { type: "submit" }, "Show Parking Locations"));
  const title = preview ? heading("Find Parking Locations") : null;

  function display(permit, announce = false) {
    const list = element("ul", {}, ...permit.lots.map(lot => element("li", {}, lot)));
    const map = mapFiles[permit.id - 1];
    const src = "/ds3-assets/maps/" + map;
    const parts = [element(preview ? "h3" : "h2", {}, permit.name + " covered lots"), list];
    if (preview) {
      parts.push(link("View " + permit.name + " lot details and map", "/ds3/lots?permit_id=" + permit.id));
    } else {
      parts.push(paragraph(permit.eligibility_reason));
      if (permit.lottery_required) parts.push(lotteryNotice(permit));
      if (map) {
        const detailedMap = element("details", { class: "campus-map" },
          element("summary", {}, "View detailed UNH campus map for " + permit.name),
          paragraph("The official UNH map includes other parking areas and campus details. Use the covered-lot list above for your selected permit."),
          element("img", { src, loading: "lazy", alt: "Official UNH campus map for " + permit.name + ". Covered lots for this permit are listed above." }),
          link("Open the full-size " + permit.name + " map", src));
        parts.push(detailedMap);
      }
    }
    results.replaceChildren(...parts);
    if (announce) status.textContent = permit.name + " coverage updated. " + permit.lots.length + (permit.lots.length === 1 ? " lot or parking area listed." : " lots or parking areas listed.");
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (validate(form)) display(permits.find(permit => permit.id === Number(picker.value)), true);
  });
  const selected = permits.find(permit => permit.id === Number(picker.value));
  if (selected) display(selected);
  if (!preview && query.get("from") === "my-parking") {
    const application = query.get("application");
    const target = /^APP-\d+$/.test(application || "") ? "#" + application : "";
    container.append(buttonLink("Back to My Applications", "/ds3/my-parking" + target));
  }
  container.append(card(...(title ? [title] : []), paragraph("Choose a permit to see its covered lots. Expand the detailed campus map if you need more context."), form, results,
    ...(preview ? [buttonLink("View covered lots and maps", "/ds3/lots")] : [paragraph("Coverage is based on published permit information. Follow posted signs.")] )));
}

async function myParking(focusId) {
  const records = await api("/applications");
  const target = focusId || location.hash.slice(1);
  const cards = records.slice().reverse().map(record => {
    const title = heading(record.permit_type_name + " - " + record.id);
    title.id = record.id;
    const links = element("div", { class: "actions" },
      link("View covered lots for " + record.permit_type_name, "/ds3/lots?" + new URLSearchParams({ from: "my-parking", permit_id: record.permit_type_id, application: record.id })));
    if (record.status === "under_review") {
      const confirm = element("details", {}, element("summary", {}, "Withdraw application"),
        paragraph("You can submit a corrected application after withdrawing."));
      const button = action("Confirm withdrawal", async () => {
        button.disabled = true;
        try {
          await api("/applications/" + encodeURIComponent(record.id) + "/withdraw", {});
          await myParking(record.id);
          status.textContent = "Application " + record.id + " withdrawn.";
        } catch (error) {
          status.textContent = error.message;
          button.disabled = false;
          button.focus();
        }
      });
      confirm.append(button);
      links.append(confirm);
    }
    const applicationCard = card(title, element("p", { class: "status-note" }, record.status_explanation), paragraph(record.next_action),
      paragraph("License plate: " + record.vehicle.plate),
      paragraph("State: " + record.vehicle.state), links);
    if (record.id === target) {
      applicationCard.classList.add("application-highlight");
      window.setTimeout(() => applicationCard.classList.remove("application-highlight"), 5000);
    }
    return applicationCard;
  });
  content.replaceChildren(...(cards.length ? cards : [
    card(paragraph("You have no applications yet. Submitted applications and their status will appear here."),
      link("Start a permit application", "/ds3/permits")),
  ]));
  if (target) document.getElementById(target)?.focus();
}

async function dashboard() {
  const applications = await api("/applications").catch(() => null);
  const latest = applications?.at(-1);
  const applicationStatus = latest
    ? ({ under_review: "Pending Review", withdrawn: "Withdrawn" })[latest.status] || latest.status
    : "";
  const applicationStatusHref = latest
    ? "/ds3/my-parking#" + encodeURIComponent(latest.id)
    : "/ds3/my-parking";
  const applicationsCard = card(heading("View Application Status"));
  if (applications?.length === 0) {
    applicationsCard.append(
      paragraph("You do not have any permit applications yet."),
      paragraph("Applications will appear here after you submit them."),
      buttonLink("Start Your First Application", "/ds3/permits", true));
  } else if (latest) {
    applicationsCard.append(
      element("p", { class: "status-note" }, element("strong", {}, "Status: "), applicationStatus));
    if (latest.status === "withdrawn") {
      applicationsCard.append(
        paragraph("This application does not authorize parking."),
        paragraph("You may submit a new permit application if needed."));
    } else {
      applicationsCard.append(paragraph(latest.authorization === "valid"
        ? "This application authorizes parking."
        : "This application does not authorize parking."));
    }
    applicationsCard.append(
      buttonLink("View my application status", applicationStatusHref));
  } else {
    applicationsCard.append(
      element("p", { class: "status-note" }, "Status is temporarily unavailable. Open My Applications to try again."),
      buttonLink("View my application status", applicationStatusHref));
  }
  const grid = element("div", { class: "dashboard-grid" });
  const maps = element("div", { class: "map-card" });
  grid.append(
    card(heading("Apply for a Permit"), progress(),
      paragraph("See permit options and costs, then review your details before submitting."),
      buttonLink("Apply for a Permit", "/ds3/permits", true)),
    applicationsCard,
    maps,
    card(heading("Manage Parking Tickets"),
      paragraph("View ticket details, make a payment, or submit an appeal."),
      buttonLink("Manage Tickets", "/ds3/tickets", true)),
  );
  content.append(grid);
  await coverage(true, maps);
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = cents => currency.format(cents / 100);
const ticketNumberHint = "Enter the ticket number printed on the citation, for example: AB-123.";

function submitForm(form, button, save) {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (button.disabled || !validate(form)) return;
    button.disabled = true;
    try {
      await save();
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
      button.focus();
    } finally {
      button.disabled = false;
    }
  });
}

function ticketField(id, value = "", name = id) {
  const input = element("input", { id, name, required: "", maxlength: "40", pattern: "[A-Za-z0-9\\-]+" });
  input.value = value;
  return input;
}

function requestIds() {
  let previous;
  return payload => {
    const key = JSON.stringify(payload);
    if (previous?.key !== key) previous = { key, id: crypto.randomUUID() };
    return { ...payload, request_id: previous.id };
  };
}

async function tickets() {
  let records = await api("/tickets");
  let filter = query.get("ticket_number") || "";
  const selected = new Set();
  const results = element("div");
  const total = element("p", { class: "status-note", role: "status" });
  const search = ticketField("ticket-search", filter);
  const searchButton = element("button", { type: "submit" }, "Search tickets");
  const searchForm = element("form", { novalidate: "" },
    field("Ticket number", search, "Enter the number printed on your ticket."),
    element("div", { class: "actions" }, searchButton,
      action("Show all tickets", () => {
        search.value = "";
        filter = "";
        search.removeAttribute("aria-invalid");
        document.getElementById("ticket-search-error").textContent = "";
        render();
      }, true)));
  searchForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!validate(searchForm)) return;
    filter = search.value.trim().toUpperCase();
    render();
  });

  const number = ticketField("new-ticket-number");
  const amount = element("input", { id: "ticket-amount", type: "number", required: "", min: ".01", max: "9999.99", step: ".01" });
  const reason = element("textarea", { id: "ticket-reason", required: "", maxlength: "500", rows: "3" });
  const addButton = element("button", { type: "submit" }, "Save ticket");
  function clearAddForm() {
    addForm.reset();
    for (const control of addForm.elements) {
      if (!control.id) continue;
      control.removeAttribute("aria-invalid");
      control.setCustomValidity?.("");
      const error = document.getElementById(control.id + "-error");
      if (error) error.textContent = "";
    }
  }
  function closeAdd() {
    if (addButton.disabled) return;
    clearAddForm();
    addPanel.open = false;
    addPanel.querySelector("summary").focus();
  }
  const cancelAdd = action("Cancel", closeAdd, true);
  const addForm = element("form", { novalidate: "" }, field("Ticket number", number),
    field("Amount in dollars", amount, "For example, 35.00."), field("Reason shown on the ticket", reason),
    element("div", { class: "actions" }, cancelAdd, addButton));
  const addPanel = element("details", {}, element("summary", {}, "Add a ticket"), addForm);
  addPanel.addEventListener("toggle", () => { if (!addPanel.open) clearAddForm(); });
  addPanel.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAdd();
    }
  });
  const addRequest = requestIds();
  reason.addEventListener("input", () => reason.setCustomValidity(reason.value.trim() ? "" : "Enter the reason shown on the ticket."));
  submitForm(addForm, addButton, async () => {
    reason.setCustomValidity(reason.value.trim() ? "" : "Enter the reason shown on the ticket.");
    if (!validate(addForm)) return;
    const ticket = await api("/tickets", addRequest({ number: number.value, amount: amount.value, reason: reason.value.trim() }));
    records.push(ticket);
    clearAddForm();
    addPanel.open = false;
    filter = "";
    search.value = "";
    render();
    document.getElementById("ticket-" + ticket.id)?.focus();
    status.textContent = "Ticket " + ticket.number + " saved.";
  });

  const pay = action("Review payment record", () => review("pay", pay));
  const appeal = action("Review appeal record", () => review("appeal", appeal));
  const clear = action("Clear selection", () => {
    selected.clear();
    results.querySelectorAll('input[type="checkbox"]').forEach(box => { box.checked = false; });
    updateTotal();
    clear.focus();
  }, true);
  function chosen() {
    return records.filter(ticket => selected.has(ticket.id));
  }
  function updateTotal() {
    const count = selected.size;
    total.textContent = count + " selected · Total " + money(chosen().reduce((sum, ticket) => sum + ticket.amount_cents, 0));
    pay.disabled = appeal.disabled = count === 0;
  }
  function confirmation(record) {
    const panel = element("details", {},
      element("summary", {}, "View confirmation " + record.id),
      paragraph(record.action === "pay" ? "Payment recorded" : "Appeal recorded"),
      paragraph("Total " + money(record.total_cents)),
      paragraph(new Date(record.created_at).toLocaleDateString()),
      ...(record.explanation ? [paragraph(record.explanation)] : []),
      action("Download confirmation", () => {
        const text = ["UNH Parking", "Confirmation " + record.id, "Date: " + record.created_at,
          record.action === "pay" ? "Payment recorded" : "Appeal recorded",
          ...record.tickets.map(ticket => ticket.number + " · " + money(ticket.amount_cents)),
          "Total " + money(record.total_cents), record.explanation].filter(Boolean).join("\n");
        const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" }));
        element("a", { href: url, download: record.id + ".txt" }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }));
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        panel.open = false;
        panel.querySelector("summary").focus();
      }
    });
    return panel;
  }
  function render() {
    const focusedId = results.contains(document.activeElement) ? document.activeElement.id : "";
    const visible = records.filter(ticket => !filter || ticket.number === filter.trim().toUpperCase());
    results.replaceChildren(...visible.map(ticket => {
      const title = heading("Ticket " + ticket.number);
      title.id = "ticket-" + ticket.id;
      const nodes = [title,
        paragraph(money(ticket.amount_cents) + " · " + ({ unpaid: "Unpaid", paid: "Payment recorded", appeal_pending: "Appeal recorded" })[ticket.status]),
        paragraph(ticket.reason)];
      if (ticket.status === "unpaid") {
        const box = element("input", { type: "checkbox", id: "ticket-box-" + ticket.id });
        box.checked = selected.has(ticket.id);
        box.addEventListener("change", () => {
          if (box.checked && selected.size >= 50) {
            box.checked = false;
            status.textContent = "Select up to 50 tickets at a time.";
            return;
          }
          if (box.checked) selected.add(ticket.id);
          else selected.delete(ticket.id);
          updateTotal();
        });
        nodes.push(element("label", {}, box, " Select ticket " + ticket.number));
      }
      if (ticket.confirmation) nodes.push(confirmation(ticket.confirmation));
      return card(...nodes);
    }));
    if (!visible.length) results.append(paragraph(filter ? "No tickets match that number." : "No tickets saved. Add a ticket to get started."));
    updateTotal();
    if (focusedId) document.getElementById(focusedId)?.focus();
  }

  function review(kind, opener) {
    const items = chosen();
    const cents = items.reduce((sum, ticket) => sum + ticket.amount_cents, 0);
    const title = heading(kind === "pay" ? "Review payment record" : "Review appeal record");
    title.id = "ticket-review-title";
    const dialog = element("dialog", { "aria-labelledby": title.id });
    const explanation = element("textarea", { id: "appeal-explanation", required: "", maxlength: "2000", rows: "4" });
    const reviewed = element("input", { id: "ticket-reviewed", type: "checkbox", required: "" });
    const submit = element("button", { type: "submit" }, kind === "pay" ? "Record payment" : "Record appeal");
    const cancel = action("Cancel", () => dialog.close(), true);
    const error = element("p", { class: "error", role: "alert" });
    let updatedTicketId = "";
    const form = element("form", { novalidate: "" },
      element("ul", {}, ...items.map(ticket => element("li", {}, ticket.number + " · " + money(ticket.amount_cents)))),
      paragraph("Total " + money(cents)));
    if (kind === "appeal") {
      explanation.addEventListener("input", () => explanation.setCustomValidity(explanation.value.trim() ? "" : "Explain why you are appealing."));
      form.append(field("Appeal explanation", explanation));
    }
    form.append(field("I reviewed the selected tickets and total", reviewed), error,
      element("div", { class: "actions" }, cancel, submit));
    dialog.append(title, form);
    dialog.addEventListener("close", () => {
      dialog.remove();
      const target = updatedTicketId ? document.getElementById("ticket-" + updatedTicketId) : null;
      (target || (opener.disabled ? searchButton : opener)).focus();
    });
    dialog.addEventListener("keydown", event => {
      if (event.key === "Escape" && !submit.disabled) {
        event.preventDefault();
        dialog.close();
      }
    });
    const actionRequest = requestIds();
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (kind === "appeal") explanation.setCustomValidity(explanation.value.trim() ? "" : "Explain why you are appealing.");
      if (submit.disabled || !validate(form)) return;
      submit.disabled = cancel.disabled = true;
      error.textContent = "";
      try {
        const result = await api("/ticket-actions", actionRequest({
          ticket_ids: items.map(ticket => ticket.id), action: kind, expected_total_cents: cents,
          explanation: kind === "appeal" ? explanation.value.trim() : "",
        }));
        for (const ticket of items) {
          ticket.status = kind === "pay" ? "paid" : "appeal_pending";
          ticket.confirmation = result;
          selected.delete(ticket.id);
        }
        updatedTicketId = items[0]?.id || "";
        render();
        dialog.close();
        status.textContent = "Confirmation " + result.id + " saved.";
      } catch (failure) {
        error.textContent = failure.message;
        submit.disabled = cancel.disabled = false;
        submit.focus();
      }
    });
    dialog.addEventListener("cancel", event => { if (submit.disabled) event.preventDefault(); });
    document.body.append(dialog);
    dialog.showModal();
    title.focus();
  }

  content.append(contextHelp("ticket", "Use the ticket number printed on the citation. Select an unpaid ticket to review a payment or appeal record."),
    card(heading("Find a ticket"), searchForm), card(heading("Ticket records"), addPanel, results),
    card(heading("Selected tickets"), total, element("div", { class: "actions" }, pay, appeal, clear)));
  render();
}

function contextHelp(topic, guidance) {
  const section = topic === "permit" ? "permits" : "tickets";
  return element("details", { class: "context-help" }, element("summary", {}, "Get " + topic + " help"),
    paragraph(guidance), link("Read the " + topic + " FAQ", "/ds3/help#" + section));
}

async function help() {
  const { commuter_rule: commuterRule } = await api("/ds3/permit-form-options");
  const faq = (question, answer, destination) => element("details", {}, element("summary", {}, question),
    paragraph(answer), ...(destination ? [destination] : []));
  const permitHelp = card(heading("Permit FAQ"),
    faq("How do I apply for a permit?", "Enter your residence and student year, select a matching permit, then review your vehicle and application details.", link("Start a permit application", "/ds3/permits")),
    faq("Does an application under review authorize parking?", "Wait for approval before parking. Check My Applications for your application status and next action.", link("Check application status", "/ds3/my-parking")),
    faq("Am I eligible for a commuter permit?", commuterRule),
    faq("Where can I park with my permit?", "Select a permit to see its covered lots and restrictions.", link("View covered lots", "/ds3/lots")));
  permitHelp.id = "permits";
  const ticketHelp = card(heading("Ticket FAQ"),
    faq("How do I find a ticket?", "Enter the ticket number shown on the citation. If you have not added the ticket yet, enter its details first.", link("Find or add a ticket", "/ds3/tickets")),
    faq("How do I review a payment or appeal?", "Select the tickets, verify the total and review the details before recording your action. Open the ticket record to find its confirmation."));
  ticketHelp.id = "tickets";
  content.append(permitHelp, ticketHelp, card(heading("Contact Parking Services"),
    paragraph("Send a written question using the official UNH contact form. Include your email address for a reply. For ticket appeals, use the Tickets page."),
    buttonLink("Open UNH written support form", "https://www.unh.edu/transportation/about/contact-us", true)));
  if (location.hash === "#permits" || location.hash === "#tickets") document.getElementById(location.hash.slice(1)).scrollIntoView();
}


async function vehicleRequest(path, options) {
  const response = await fetch(path, {headers: {"Content-Type":"application/json"}, ...options});
  if (!response.ok) throw new Error("Unable to update the saved vehicle. Check the details and try again.");
  return response.json();
}
async function savedVehicles(moveFocus = false) {
  content.replaceChildren(paragraph("Save a vehicle to reuse its details in future permit applications. Changes here do not change submitted applications."));
  const items = await api("/vehicles");
  const list = card(heading("Your saved vehicles"));
  content.append(list);
  const plate = element("input", { id: "saved-plate", required: "", maxlength: "10", pattern: "[A-Za-z0-9][A-Za-z0-9 -]*" });
  const state = element("input", { id: "saved-state", required: "", maxlength: "2", pattern: "[A-Za-z]{2}" });
  const type = select("saved-type", [["car", "Car"], ["motorcycle", "Motorcycle"], ["moped", "Moped"]]);
  let editing = null;
  const title = heading("Add a vehicle");
  const {form, submit} = formFor(async () => {
    submit.disabled = true;
    try {
      await vehicleRequest(editing ? "/vehicles/" + editing : "/vehicles", {method: editing ? "PUT" : "POST", body: JSON.stringify({plate: plate.value, state: state.value, vehicle_type: type.value})});
      status.textContent = editing ? "Vehicle updated." : "Vehicle saved.";
      await savedVehicles(true);
    } catch (error) { status.textContent = error.message; submit.disabled = false; }
  });
  submit.textContent = "Save vehicle";
  form.append(field("License plate", plate), field("State", state, "Two-letter state code, for example NH."), field("Vehicle type", type), element("div", {class: "actions"}, submit, action("Cancel edit", () => savedVehicles(), true)));
  if (!items.length) list.append(paragraph("No vehicles saved yet. You can always enter a vehicle manually when applying."));
  for (const item of items) {
    list.append(card(heading(item.plate + " / " + item.state), paragraph(item.vehicle_type), element("div", {class: "actions"},
      action("Edit " + item.plate, () => { editing = item.id; plate.value = item.plate; state.value = item.state; type.value = item.vehicle_type; title.textContent = "Edit vehicle"; plate.focus(); }, true),
      action("Remove " + item.plate, async () => {
        const dialog = element("dialog", {"aria-label": "Remove saved vehicle"}, heading("Remove " + item.plate + "?"), paragraph("Submitted applications will keep their original vehicle information."));
        dialog.append(action("Keep vehicle", () => { dialog.close(); dialog.remove(); }), action("Remove vehicle", async () => {
          try { await vehicleRequest("/vehicles/" + item.id, {method:"DELETE"}); dialog.close(); dialog.remove(); status.textContent = "Vehicle removed."; await savedVehicles(true); }
          catch(error) { status.textContent = error.message; }
        }, true));
        dialog.addEventListener("close", () => dialog.remove(), {once: true});
        document.body.append(dialog); dialog.showModal();
      }, true))));
  }
  if (moveFocus) list.querySelector("h2").focus();
  content.append(card(title, form), paragraph("Saved vehicles are shared in this running application and reset when the server restarts."), buttonLink("Apply for a permit", "/ds3/permits"));
}

async function start() {
  switch (document.body.dataset.page) {
    case "permits": return permits();
    case "my-parking": return myParking();
    case "lots": return coverage(false);
    case "tickets": return tickets();
    case "help": return help();
    case "vehicles": return savedVehicles();
    case "home": return dashboard();
  }
}

document.querySelector(".skip")?.addEventListener("click", event => {
  event.preventDefault();
  document.querySelector("#main")?.focus();
});

start().catch(error => {
  status.textContent = "Unable to load this page. " + error.message;
  content.append(action("Reload page", () => location.reload()));
});


const helpDialog = document.querySelector("#parking-help-dialog");
const footerHelpButton = document.querySelector(
  '.portal-footer a[href="/ds3/help"]'
);

if (footerHelpButton && helpDialog) {
  footerHelpButton.textContent = "Need parking help?";

  const title = document.createElement("h2");
  title.id = "parking-help-title";
  title.textContent = "Parking Help";

  const helpPage = document.createElement("iframe");
  helpPage.addEventListener("load", () => {
    const helpDocument = helpPage.contentDocument;
  
    if (!helpDocument) return;
  
    const popupStyles = helpDocument.createElement("style");
    popupStyles.textContent = `
      .masthead,
      .nav-bar,
      .portal-footer,
      .skip {
        display: none;
      }
  
      main.wrap {
        width: 100%;
        max-width: none;
        margin: 0;
        padding: 1rem;
        box-sizing: border-box;
      }
    `;
  
    helpDocument.head.appendChild(popupStyles);
    helpDocument.querySelectorAll("a[href]").forEach(anchor => anchor.target = "_top");
    helpDocument.addEventListener("keydown", event => { if (event.key === "Escape") helpDialog.close(); });
  });
  helpPage.src = "/ds3/help";
  helpPage.title = "Parking frequently asked questions";
  helpPage.style.width = "100%";
  helpPage.style.height = "60vh";
  helpPage.style.border = "0";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => helpDialog.close());

  helpDialog.replaceChildren(title, helpPage, closeButton);
  helpDialog.addEventListener("close", () => footerHelpButton.focus());

  footerHelpButton.addEventListener("click", event => {
    event.preventDefault();
    helpDialog.showModal();
    closeButton.focus();
  });
}