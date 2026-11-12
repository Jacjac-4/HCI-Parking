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

function progress(current) {
  return element("ol", { class: "progress", "aria-label": "Permit application steps" },
    ...permitSteps.map((step, index) => element("li", index + 1 === current ? { "aria-current": "step" } : {},
      element("span", { "aria-hidden": "true" }, String(index + 1)), step)));
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
  const wrapper = element("div", { class: "field" }, element("label", { for: control.id }, label), control);
  if (hint) wrapper.append(description);
  wrapper.append(error);
  return wrapper;
}

function select(id, choices, value) {
  const input = element("select", { id, required: "" }, element("option", { value: "" }, "Choose an option"));
  for (const [key, label] of choices) input.append(element("option", { value: key }, label));
  input.value = value || "";
  return input;
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

function showStep(title, body, moveFocus) {
  const titleNode = heading(title);
  const step = Number(title.match(/^Step (\d+)/)?.[1]);
  content.replaceChildren(progress(step), card(titleNode, body));
  if (moveFocus) titleNode.focus();
}

async function permits() {
  const { residences, commuter_rule: commuterRule } = await api("/ds3/permit-form-options");
  const answers = { name: "", residence: "", year: "", commuter_eligible: false };
  const vehicle = { plate: "", state: "" };
  let matches = [];
  let chosen;
  let request;

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

  function about(moveFocus = true) {
    const name = element("input", { id: "name", autocomplete: "name", maxlength: "100", required: "" });
    name.value = answers.name;
    name.addEventListener("input", () => name.setCustomValidity(""));
    const residence = select("residence", Object.entries(residences), answers.residence);
    const year = select("year", [["freshman", "Freshman"], ["continuing", "Sophomore, junior, senior, or graduate student"]], answers.year);
    const commuter = element("input", { type: "checkbox", id: "commuter" });
    commuter.checked = answers.commuter_eligible;
    const commuterField = element("div", { class: "field" },
      element("label", {}, commuter, " I live off campus and meet the commuter requirements"),
      paragraph(commuterRule));
    function updateCommuter() {
      commuterField.hidden = residence.value !== "off_campus";
      if (commuterField.hidden) commuter.checked = false;
    }
    residence.addEventListener("change", updateCommuter);
    updateCommuter();
    const { form, submit } = formFor(async () => {
      Object.assign(answers, { name: name.value.trim(), residence: residence.value, year: year.value, commuter_eligible: commuter.checked });
      if (!answers.name) {
        name.setCustomValidity("Enter your name.");
        validate(form);
        return;
      }
      matches = await api("/permit-matches", answers);
      if (!matches.some(permit => permit.id === chosen?.id)) chosen = undefined;
      options();
    });
    form.append(field("Your name", name, "For example, Jane Doe."), field("Where do you live?", residence), field("Student year", year), commuterField, submit);
    showStep("Step 1 of 5: About you", form, moveFocus);
  }

  function options() {
    if (!matches.length) {
      const explanation = answers.year === "freshman" && answers.residence !== "off_campus"
        ? "The academic-year student permits in this prototype have no match for freshmen who live on campus. Off-campus freshmen may qualify for other options."
        : "No academic-year student permits match these answers.";
      showStep("Step 2 of 5: No matching permits", element("div", {}, paragraph(explanation),
        element("div", { class: "actions" }, action("Edit about you", () => about()),
          link("Parking Help for permits", "/ds3/help#permits"))), true);
      return;
    }
    const picker = select("permit", matches.map(permit => [permit.id, permit.name + " · $" + permit.price]), chosen?.id);
    const { form, submit } = formFor(() => {
      chosen = matches.find(permit => permit.id === Number(picker.value));
      vehicleStep();
    });
    form.append(field("Permit type", picker, "Eligibility is reviewed after you apply."),
      element("div", { class: "actions" }, action("Back", () => about()), submit));
    showStep("Step 2 of 5: Permit", form, true);
  }

  function vehicleStep() {
    const plate = element("input", { id: "plate", required: "", maxlength: "10", pattern: "[A-Za-z0-9][A-Za-z0-9 \\-]*" });
    const state = element("input", { id: "state", required: "", maxlength: "2", pattern: "[A-Za-z]{2}" });
    plate.value = vehicle.plate;
    state.value = vehicle.state;
    const { form, submit } = formFor(() => {
      Object.assign(vehicle, { plate: plate.value.trim().toUpperCase(), state: state.value.toUpperCase() });
      review();
    });
    form.append(paragraph(chosen.name + " requires a " + chosen.vehicle_requirement + "."),
      field("License plate", plate, "Enter up to 10 letters, numbers, spaces, or hyphens."),
      field("State", state, "Enter a two-letter state code, such as NH."),
      element("div", { class: "actions" }, action("Back", options), submit));
    showStep("Step 3 of 5: Vehicle", form, true);
  }

  function review() {
    const confirm = element("input", { id: "reviewed", type: "checkbox", required: "" });
    const { form, submit } = formFor(async () => {
      const payload = { applicant: { ...answers }, vehicle: { ...vehicle, vehicle_type: chosen.vehicle_requirement }, permit_type_id: chosen.id };
      const key = JSON.stringify(payload);
      if (request?.key !== key) request = { key, id: crypto.randomUUID() };
      const record = await api("/applications", { ...payload, request_id: request.id });
      showStep("Step 5 of 5: Application received", element("div", {},
        paragraph("Confirmation " + record.id), paragraph(record.status_explanation),
        paragraph(record.next_action), link("View My Parking", "/ds3/my-parking")), true);
    }, "Submit application");
    form.append(element("dl", { class: "record-summary" },
        element("dt", {}, "Permit"), element("dd", {}, chosen.name),
        element("dt", {}, "Applicant"), element("dd", {}, answers.name),
        element("dt", {}, "Vehicle"), element("dd", {}, vehicle.plate + " · " + vehicle.state)),
      element("p", { class: "status-note" }, "Submitting an application does not authorize parking."),
      field("I reviewed the permit and vehicle details", confirm),
      element("div", { class: "actions" }, action("Edit about you", () => about()),
        action("Edit permit", options), action("Edit vehicle", vehicleStep), submit));
    showStep("Step 4 of 5: Review", form, true);
  }

  content.before(contextHelp("permit", "Your residence and student year determine which permits appear. You can edit your answers before submitting."));
  about(false);
}

const mapFiles = [
  "commuter.jpg", "resident-core.jpg", "resident-core.jpg", "resident-core.jpg", "resident-core.jpg",
  "resident-west.jpg", "resident-west.jpg", "motorcycle-moped.jpg", "motorcycle-moped.jpg",
];

async function coverage(preview, container = content) {
  const permits = await api("/permit-types");
  const picker = select("map-permit", permits.map(permit => [permit.id, permit.name]), query.get("permit_id"));
  const results = element("div");
  const form = element("form", { novalidate: "" }, field("Permit type", picker),
    element("button", { type: "submit" }, "Show covered lots"));
  const title = preview ? heading("Where can I park?") : null;

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
    container.append(buttonLink("Back to My Parking", "/ds3/my-parking" + target));
  }
  container.append(card(...(title ? [title] : []), paragraph("Choose a permit to see its covered lots and campus map."), form, results,
    ...(preview ? [buttonLink("View parking maps", "/ds3/lots")] : [paragraph("Coverage is based on published permit information. Follow posted signs.")] )));
}

async function myParking(focusId) {
  const records = await api("/applications");
  const cards = records.slice().reverse().map(record => {
    const title = heading(record.permit_type_name + " · " + record.id);
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
    return card(title, element("p", { class: "status-note" }, record.status_explanation), paragraph(record.next_action),
      paragraph("Vehicle: " + record.vehicle.plate + " " + record.vehicle.state), links);
  });
  content.replaceChildren(...(cards.length ? cards : [
    card(paragraph("You have no applications yet. Submitted applications and their status will appear here."),
      link("Start a permit application", "/ds3/permits")),
  ]));
  const target = focusId || location.hash.slice(1);
  if (target) document.getElementById(target)?.focus();
}

async function dashboard() {
  const applications = await api("/applications").catch(() => null);
  const latest = applications?.at(-1);
  const statusText = latest?.status_explanation ?? (applications
    ? "No applications yet. Your submitted application will appear here."
    : "Status is temporarily unavailable. Open My Parking to try again.");
  const grid = element("div", { class: "dashboard-grid" });
  const ticketNumber = ticketField("ticket-number", "", "ticket_number");
  const ticketSearch = element("form", { action: "/ds3/tickets", method: "get", novalidate: "" },
    field("Ticket number", ticketNumber, "Enter the number printed on your ticket."), element("button", { type: "submit" }, "Search tickets"));
  ticketSearch.addEventListener("submit", event => {
    if (!validate(ticketSearch)) event.preventDefault();
  });
  const maps = element("div", { class: "map-card" });
  grid.append(
    card(heading("Get a parking permit"), progress(),
      paragraph("See permit options and costs, then review your details before submitting."),
      buttonLink("Find my permit", "/ds3/permits", true)),
    card(heading("My permit status"),
      element("p", { class: "status-note" }, statusText),
      buttonLink("View status and next steps", "/ds3/my-parking")),
    maps,
    card(heading("Pay or appeal a ticket"), ticketSearch,
      paragraph("Open Tickets to add a ticket or review a confirmation."),
      buttonLink("Manage tickets", "/ds3/tickets")),
  );
  content.append(grid);
  await coverage(true, maps);
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = cents => currency.format(cents / 100);

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
    field("Ticket number", search, "Enter the number printed on your ticket."), searchButton,
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
  const addForm = element("form", { novalidate: "" }, field("Ticket number", number),
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
    faq("Does an application under review authorize parking?", "Wait for approval before parking. Check My Parking for your application status and next action.", link("Check application status", "/ds3/my-parking")),
    faq("Am I eligible for a commuter permit?", commuterRule),
    faq("Where can I park with my permit?", "Select a permit to see its covered lots and restrictions.", link("View covered lots", "/ds3/lots")));
  permitHelp.id = "permits";
  const ticketHelp = card(heading("Ticket FAQ"),
    faq("How do I find a ticket?", "Enter the ticket number shown on the citation. If you have not added the ticket yet, enter its details first.", link("Find or add a ticket", "/ds3/tickets")),
    faq("How do I review a payment or appeal?", "Select the tickets, verify the total and review the details before recording your action. Open the ticket record to find its confirmation."));
  ticketHelp.id = "tickets";
  content.append(permitHelp, ticketHelp, card(heading("Contact Parking Services"),
    link("Find written contact options at UNH Transportation", "https://www.unh.edu/transportation/parking")));
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
