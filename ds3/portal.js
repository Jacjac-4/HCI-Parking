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
const action = (text, handler) => {
  const button = element("button", { type: "button" }, text);
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
  const wrapper = element("div", { class: "field" }, element("label", { for: control.id }, label));
  if (hint) wrapper.append(description);
  wrapper.append(control, error);
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
      "Choose your current academic year.");
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
        ? "The academic-year student permits in this prototype have no match for freshmen who live on campus. Off-campus freshmen may qualify for other options."
        : "No academic-year student permits match these answers.";
      showStep("Step 2 of 5: No matching permits", element("div", {}, paragraph(explanation),
        element("div", { class: "actions" }, action("Edit about you", () => about()),
          link("Parking Help for permits", "/ds3/help#permits"))), true, navigatePermitStep, furthestStep);
      return;
    }
    const picker = radioGroup("permit", "Choose your permit type",
      matches.map(permit => [permit.id, permit.name + " - $" + permit.price]), chosen?.id,
      "Select a permit to continue.", "choice-cards");
    picker.addEventListener("change", () => {
      chosen = matches.find(permit => permit.id === Number(picker.querySelector("input:checked")?.value));
      persistDraft();
    });
    const { form, submit } = formFor(() => {
      chosen = matches.find(permit => permit.id === Number(picker.querySelector("input:checked")?.value));
      furthestStep = Math.max(furthestStep, 3);
      persistDraft();
      if (returnToReview) review();
      else vehicleStep();
    });
    form.append(picker,
      element("div", { class: "actions" }, action("Back", () => about(true, returnToReview)), submit));
    showStep("Step 2 of 5: Permit", form, true, navigatePermitStep, furthestStep);
  }

  function vehicleStep(fromReview = false) {
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
    showStep("Step 3 of 5: Vehicle", form, true, navigatePermitStep, furthestStep);
  }

  function review() {
    returnToReview = false;
    persistDraft("review");
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
        element("section", { class: "next-steps", "aria-labelledby": "confirmation-next-steps-title" },
          element("h3", { id: "confirmation-next-steps-title" }, "Next Steps"),
          element("ul", {},
            element("li", {}, link("View your application in My Applications",
              "/ds3/my-parking#" + encodeURIComponent(record.id))),
            element("li", {}, "Check your application status."),
            element("li", {}, "Withdraw an incorrect application if necessary.")))), true);
    }, "Submit application");
    const submitArea = element("div", { class: "actions" }, submit);
    form.append(paragraph("Review your application below. You can still make changes before submitting."),
      element("div", { class: "review-summary" },
        element("section", { class: "review-card", "aria-labelledby": "review-permit-title" },
          element("h3", { id: "review-permit-title" }, "Permit"),
          paragraph(chosen.name),
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
          element("li", {}, "You will be notified when your permit is approved or denied."),
          element("li", {}, "You can view your application status in My Applications."))),
      element("aside", { class: "parking-warning", "aria-label": "Important parking restriction" },
        element("h3", {}, "Important"),
        element("strong", {}, "Do not park on campus until your permit has been approved.")),
      submitArea);
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
  else if (currentStep === "vehicle") vehicleStep(returnToReview);
  else review();
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
      if (map) {
        if (map === "resident-core.jpg") parts.push(paragraph("This map shows several permit categories. Use the covered-lot list above for the selected permit."));
        parts.push(element("img", { src, alt: "UNH campus map for " + permit.name + ". Covered lots are listed above." }),
          link("Open the full-size " + permit.name + " map", src));
      }
    }
    results.replaceChildren(...parts);
    if (announce) status.textContent = permit.name + " coverage updated. " + permit.lots.length + " lots or parking areas listed.";
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
  container.append(card(...(title ? [title] : []), paragraph("Choose a permit to see its covered lots and campus map."), form, results,
    ...(preview ? [buttonLink("View parking maps", "/ds3/lots")] : [paragraph("Coverage is based on published permit information. Follow posted signs.")] )));
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
    field("Ticket number", search, ticketNumberHint), searchButton,
    action("Show all tickets", () => {
      search.value = "";
      filter = "";
      search.removeAttribute("aria-invalid");
      document.getElementById("ticket-search-error").textContent = "";
      render();
    }));
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
  const addForm = element("form", { novalidate: "" }, field("Ticket number", number, ticketNumberHint),
    field("Amount in dollars", amount, "For example, 35.00."), field("Reason shown on the ticket", reason), addButton);
  const addPanel = element("details", {}, element("summary", {}, "Add a ticket"), addForm);
  const addRequest = requestIds();
  reason.addEventListener("input", () => reason.setCustomValidity(reason.value.trim() ? "" : "Enter the reason shown on the ticket."));
  submitForm(addForm, addButton, async () => {
    reason.setCustomValidity(reason.value.trim() ? "" : "Enter the reason shown on the ticket.");
    if (!validate(addForm)) return;
    const ticket = await api("/tickets", addRequest({ number: number.value, amount: amount.value, reason: reason.value.trim() }));
    records.push(ticket);
    addForm.reset();
    addPanel.open = false;
    addPanel.querySelector("summary").focus();
    filter = "";
    search.value = "";
    render();
    status.textContent = "Ticket " + ticket.number + " saved.";
  });

  const pay = action("Review payment record", () => review("pay", pay));
  const appeal = action("Review appeal record", () => review("appeal", appeal));
  const clear = action("Clear selection", () => {
    selected.clear();
    results.querySelectorAll('input[type="checkbox"]').forEach(box => { box.checked = false; });
    updateTotal();
  });
  function chosen() {
    return records.filter(ticket => selected.has(ticket.id));
  }
  function updateTotal() {
    const count = selected.size;
    total.textContent = count + " selected · Total " + money(chosen().reduce((sum, ticket) => sum + ticket.amount_cents, 0));
    pay.disabled = appeal.disabled = count === 0;
  }
  function confirmation(record) {
    return element("details", {},
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
  }
  function render() {
    const visible = records.filter(ticket => !filter || ticket.number === filter.trim().toUpperCase());
    results.replaceChildren(...visible.map(ticket => {
      const nodes = [heading("Ticket " + ticket.number),
        paragraph(money(ticket.amount_cents) + " · " + ({ unpaid: "Unpaid", paid: "Payment recorded", appeal_pending: "Appeal recorded" })[ticket.status]),
        paragraph(ticket.reason)];
      if (ticket.status === "unpaid") {
        const box = element("input", { type: "checkbox" });
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
    const cancel = action("Cancel", () => dialog.close());
    const error = element("p", { class: "error", role: "alert" });
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
      (opener.disabled ? searchButton : opener).focus();
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
    // A written support option for users who cannot or prefer not to call.
  // This prototype does not send or store messages.
  const contactForm = element("form");

  const emailInput = element("input", {
    id: "help-contact-email",
    type: "email",
    name: "email",
    autocomplete: "email",
    required: "",
  });

  const messageInput = element("textarea", {
    id: "help-contact-message",
    name: "message",
    rows: "5",
    required: "",
  });

  const submitButton = element(
    "button",
    { type: "submit" },
    "Submit message (demo)"
  );

  // Screen readers announce the confirmation when its text changes.
  const confirmation = element("p", {
    role: "status",
    "aria-live": "polite",
  });

  contactForm.append(
    element("label", { for: "help-contact-email" }, "Your email address"),
    emailInput,
    element("label", { for: "help-contact-message" }, "How can we help?"),
    messageInput,
    submitButton,
    confirmation
  );

  contactForm.addEventListener("submit", event => {
    // Prevent a page reload or actual form submission.
    event.preventDefault();

    // Reject messages that contain only spaces.
    if (!messageInput.value.trim()) {
      messageInput.setCustomValidity("Please enter your question.");
      messageInput.reportValidity();
      return;
    }

    // Simulate the response without sending or saving anything.
    confirmation.textContent =
      "Demo only: your message has not been sent or saved. " +
      "In the completed service, Parking Services would reply by email " +
      "using the address you provided.";
  });

  // Clear the custom error when the user edits their message.
  messageInput.addEventListener("input", () => {
    messageInput.setCustomValidity("");
    confirmation.textContent = "";
  });

  content.append(
    permitHelp,
    ticketHelp,
    card(
      heading("Contact Parking Services"),
      paragraph(
        "Ask about permit eligibility, payment problems, or appeals " +
        "using written support. No phone call is needed for this option."
      ),
      paragraph(
        "Prototype only: this form demonstrates email support. " +
        "Messages are not sent or saved, and you will not receive a reply."
      ),
      contactForm,
      link(
        "Visit the official UNH Parking website",
        "https://www.unh.edu/transportation/parking"
      )
    )
  );
  if (location.hash === "#permits" || location.hash === "#tickets") document.getElementById(location.hash.slice(1)).scrollIntoView();
}

async function start() {
  switch (document.body.dataset.page) {
    case "permits": return permits();
    case "my-parking": return myParking();
    case "lots": return coverage(false);
    case "tickets": return tickets();
    case "help": return help();
    case "home": return dashboard();
  }
}

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

  footerHelpButton.addEventListener("click", event => {
    event.preventDefault();
    helpDialog.showModal();
    closeButton.focus();
  });
}