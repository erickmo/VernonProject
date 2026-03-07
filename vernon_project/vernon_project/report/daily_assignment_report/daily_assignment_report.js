let _session_ongoing = new Set();

frappe.query_reports["Daily Assignment Report"] = {
	onload(report) {
		frappe.dom.set_style(`
			/* Selected row: light grey */
			.dt-row.row-selected .dt-cell {
				background-color: #eeeeee !important;
			}
			/* Ongoing row: green */
			.dt-row.row-ongoing .dt-cell {
				background-color: #e5ffc0ff !important;
			}
		`);

		// Highlight row on click
		$(report.page.wrapper)
			.off('click', '.dt-row')
			.on('click', '.dt-row', function (e) {
				if ($(e.target).is('input[type="checkbox"]')) return;
				$('.dt-row.row-selected').removeClass('row-selected');
				$(this).addClass('row-selected');
			});

		// Note cell click -> open modal
		$(report.page.wrapper)
			.off('click', '.dt-row .note-cell')
			.on('click', '.dt-row .note-cell', function (e) {
				e.stopPropagation();
				const todoName = $(this).data('todo');
				if (!todoName || !report.data) return;

				// Find row data by todo_name
				const rowData = report.data.find(r => r.todo_name === todoName);
				if (!rowData) return;

				const $icon = $(this);
				_openNoteModal(rowData, $icon);
			});

		// Action button click
		$(report.page.wrapper)
			.off('click', '.btn-next-action')
			.on('click', '.btn-next-action', function (e) {
				e.stopPropagation();

				const match = ($(this).closest('.dt-row').attr('class') || '').match(/\bdt-row-(\d+)\b/);
				const rowIndex = match ? parseInt(match[1]) : -1;

				if (rowIndex < 0 || !report.data || !report.data[rowIndex]) return;
				const row = report.data[rowIndex];

				frappe.confirm(
					__("Yakin ubah status " + row.todo + " ke Next?"),
					() => {
						// user klik Yes
						frappe.call({
							method: "vernon_project.api.project_todo.update_status",
							args: {
								todo_id: row.todo_name,
							},
							freeze: true,
							freeze_message: __("Updating status...")
						}).then((r) => {
							if (r.message) {
								frappe.msgprint({
									title: __(r.message.status.charAt(0).toUpperCase() + r.message.status.slice(1)),
									message: r.message.message,
									indicator: r.message.status == "error" ? "red" : "green",
								});
								if (r.message.status == "error") {
									return;
								} else {
									// Reload report
									report.refresh();
								}
							}
						})
					}
				);
			});


		// Checkbox change listener
		$(report.page.wrapper)
			.off('change', '.dt-row input[data-fieldname="ongoing"]')
			.on('change', '.dt-row input[data-fieldname="ongoing"]', function () {
				const $row = $(this).closest('.dt-row');
				const isChecked = $(this).is(':checked');

				const match = ($row.attr('class') || '').match(/\bdt-row-(\d+)\b/);
				const rowIndex = match ? parseInt(match[1]) : -1;

				if (rowIndex < 0 || !report.data || !report.data[rowIndex]) return;

				const rowData = report.data[rowIndex];

				// Only the assigned user can set ongoing
				if (rowData.assigned_to !== frappe.session.user) {
					$(this).prop('checked', !isChecked);
					frappe.msgprint(__('Only the assigned user can change this'));
					return;
				}

				const todoName = rowData.todo_name;
				if (!todoName) return;

				// Update session set
				if (isChecked) {
					_session_ongoing.add(todoName);
				} else {
					_session_ongoing.delete(todoName);
				}

				// Update in-memory and DOM
				rowData.ongoing = isChecked ? 1 : 0;
				$row.toggleClass('row-ongoing', isChecked);

				// Persist to DB
				frappe.call({
					method: 'frappe.client.set_value',
					args: {
						doctype: 'Project Todo',
						name: todoName,
						fieldname: 'ongoing',
						value: isChecked ? 1 : 0
					},
					callback(r) {
						if (r.exc) {
							rowData.ongoing = isChecked ? 0 : 1;
							if (isChecked) _session_ongoing.delete(todoName);
							else _session_ongoing.add(todoName);

							// Show alert that todo updated
							frappe.show_alert(`${r.exc['message']} telah diupdate ongoingnya`);

							// Show background
							$row.toggleClass('row-ongoing', !isChecked);
						}
					}
				});
			});

		// report.$report.find("ongoing").each(function () {
		// 	const $row = $(this).closest('.dt-row');
		// 	console.log($row);
		// 	const match = ($row.attr('class') || '').match(/\bdt-row-(\d+)\b/);
		// 	const rowIndex = match ? parseInt(match[1]) : -1;
		// 	if (rowIndex < 0 || !report.data || !report.data[rowIndex]) return;
		// 	const rowData = report.data[rowIndex];
		// 	if (rowData.ongoing == 1) {
		// 		$row.toggleClass('row-ongoing', true);
		// 		$row.css('background-color', '#e5ffc0ff');
		// 	}
		// })
	},

	filters: [
		{
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: "\n⚪️ Planned\n🟠 Done\n🔷 Checked By PL\n✅ Completed",
			default: "⚪️ Planned"
		},
		{
			fieldname: "assigned_to",
			label: __("Assigned To"),
			fieldtype: "Link",
			options: "User",
			reqd: 1,
			default: frappe.session.user
		}
	],

	formatter(value, row, column, data, default_formatter) {

		if (!data) return default_formatter(value, row, column, data);

		// Note column: pre-rendered HTML from Python
		if (column.fieldname === 'note') {
			return value || '';
		}

		// Action column: manual button render
		if (column.fieldname === 'action') {
			return `<div class='text-center'><button class="btn btn-xs btn-default btn-next-action" style="padding: 3px 13px; font-weight: bold; border: 1px solid #7b20a2ff; background-color: #7b20a2ff; color: white; font-size:11px">Next</button></div>`;
		}

		if (column.fieldname == "todo") {
			column.editable = true;
			if (data.ongoing) {
				return "🔅🔅 " + value;
			}
		}

		// Apply green highlight if in session set (covers both loaded + clicked)

		if (column.fieldname == 'ongoing') {
			const isOngoing = data.ongoing == 1;
			const isOwner = data.assigned_to === frappe.session.user;

			return `<span>
					<input type="checkbox" data-fieldname="ongoing"
					${isOngoing ? 'checked' : ''}
					${!isOwner ? 'disabled title="Hanya bisa diubah oleh yang ditugaskan"' : ''}
					style="cursor:${isOwner ? 'pointer' : 'not-allowed'};width:20px;height:16px;display:block;margin:auto;">
					</span>`;

		}


		// Deadline column
		if (column.fieldname === "deadline" && value) {
			const fmt = value.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2/$3');
			if (value < frappe.datetime.get_today()) {
				return `<span style="color:red;font-weight:bold;">${fmt}</span>`;
			} else if (value === frappe.datetime.get_today()) {
				return `<span style="color:orange;font-weight:bold;">${fmt}</span>`;
			} else {
				return `<span style="color:black;">${fmt}</span>`;
			}
		}

		// if (column.fieldname != 'ongoing') {
		if (value === "0" || value == 0) {
			return `<span style="color:#ddd;font-weight:bold;">---</span>`;
		}
		// }

		return default_formatter(value, row, column, data);
	}
};

function _openNoteModal(rowData, $icon) {
	const isAllowed = [
		rowData.assigned_to,
		rowData.project_owner,
		rowData.project_leader
	].includes(frappe.session.user);

	// Fetch fresh notes from server first
	frappe.call({
		method: 'vernon_project.api.project_todo.get_notes',
		args: { todo_id: rowData.todo_name },
		callback(r) {
			const freshNotes = (r.message && r.message.notes) ? r.message.notes : '';
			// Update in-memory too
			rowData.notes = freshNotes;

			const plainText = freshNotes.replace(/<[^>]+>/g, '');

			const dialog = new frappe.ui.Dialog({
				title: `📝 Catatan: ${rowData.todo || rowData.todo_name}`,
				fields: [
					{
						fieldtype: 'HTML',
						fieldname: 'notes_preview',
						options: freshNotes
							? `<div style="margin-bottom:8px;padding:10px;border-radius:6px;background:#f9f9f9;border:1px solid #e0e0e0;max-height:180px;overflow-y:auto;">${freshNotes}</div>`
							: `<div style="margin-bottom:8px;color:#aaa;font-style:italic;">(Belum ada catatan)</div>`
					},
					{
						fieldtype: 'Small Text',
						fieldname: 'notes_edit',
						label: isAllowed ? 'Edit Catatan' : 'Catatan (read-only)',
						read_only: !isAllowed,
						default: plainText
					}
				],
				primary_action_label: 'Simpan',
				primary_action(values) {
					if (!isAllowed) {
						frappe.msgprint('Anda tidak berhak menyimpan catatan ini.');
						return;
					}
					const newNotes = values.notes_edit || '';
					frappe.call({
						method: 'vernon_project.api.project_todo.save_notes',
						args: { todo_id: rowData.todo_name, notes: newNotes },
						callback(r) {
							if (r.message && r.message.status === 'ok') {
								// Update in-memory
								rowData.notes = newNotes;
								// Update icon live
								const newIcon = newNotes.trim() ? '📝' : '💬';
								$icon.text(newIcon);
								frappe.show_alert({ message: r.message.message, indicator: 'green' });
								dialog.hide();
							} else {
								frappe.msgprint(r.message ? r.message.message : 'Gagal menyimpan.');
							}
						}
					});
				}
			});

			if (!isAllowed) {
				dialog.get_primary_btn().addClass('disabled').css('opacity', 0.4);
			}

			dialog.show();
		}
	});
}

