document.addEventListener('DOMContentLoaded', () => {

    // ================== CONFIGURATION ================== //
    // ❗ PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzCyq-rPTbGKlebbIFkA19S0SewpgLFCuEDMFqdhRLk_zGm19I7MNvbFZMPnzuQQPL6/exec';
    // =================================================== //

    // --- DOM Elements ---
    const loader = document.getElementById('loader');
    const statsContainer = document.getElementById('stats-container');
    const tableBody = document.querySelector('#contacts-table tbody');
    const statusFilter = document.getElementById('status-filter');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const bulkUpdateBtn = document.getElementById('bulk-update-btn');
    const bulkStatusSelect = document.getElementById('bulk-status-select');
    const toast = document.getElementById('toast');
    const notesModal = document.getElementById('notes-modal');
    const notesModalName = document.getElementById('notes-modal-name');
    const notesTextarea = document.getElementById('notes-textarea');
    const notesSaveBtn = document.getElementById('notes-save-btn');
    const notesCloseBtn = document.querySelector('.modal-close-btn');

    // --- App State ---
    let state = {
        contacts: [],
        statusOptions: [],
        selectedRows: new Set(),
        currentNotesRowIndex: null,
    };

    // --- API Functions ---
    const showLoader = () => loader.classList.remove('hidden');
    const hideLoader = () => loader.classList.add('hidden');

    const showToast = (message, type = 'success') => {
        toast.textContent = message;
        toast.className = type; // 'success' or 'error'
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    };

    const apiCall = async (endpoint = '', method = 'GET', body = null) => {
        showLoader();
        try {
            const options = {
                method,
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Required for Apps Script
            };
            if (body) {
                options.body = JSON.stringify(body);
                // For POST, Apps Script requires redirect: 'follow'
                options.redirect = 'follow'; 
            }
            
            const response = await fetch(`${APPS_SCRIPT_URL}${endpoint}`, options);

            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API Call Error:', error);
            showToast(error.message, 'error');
            return null;
        } finally {
            hideLoader();
        }
    };

    // --- Render Functions ---
    const renderStats = (stats) => {
        statsContainer.innerHTML = '';
        const totalCard = document.createElement('div');
        totalCard.className = 'stat-card';
        totalCard.innerHTML = `<div class="value">${stats.total}</div><div class="label">Total Contacts</div>`;
        statsContainer.appendChild(totalCard);

        Object.entries(stats.byStatus)
            .sort((a, b) => b[1] - a[1]) // Sort by count desc
            .forEach(([status, count]) => {
                if (status) {
                    const card = document.createElement('div');
                    card.className = 'stat-card';
                    card.innerHTML = `<div class="value">${count}</div><div class="label">${status}</div>`;
                    statsContainer.appendChild(card);
                }
            });
    };
    
    const renderFilterAndBulkOptions = (stats) => {
        const options = Object.keys(stats.byStatus).sort();
        state.statusOptions = options;
        
        statusFilter.innerHTML = '<option value="">All Contacts</option>';
        bulkStatusSelect.innerHTML = '';

        options.forEach(status => {
            if (status) {
                statusFilter.innerHTML += `<option value="${status}">${status}</option>`;
                bulkStatusSelect.innerHTML += `<option value="${status}">${status}</option>`;
            }
        });
    };

    const renderTable = () => {
        tableBody.innerHTML = '';
        const filterValue = statusFilter.value;
        const filteredContacts = state.contacts.filter(c => !filterValue || c.status === filterValue);

        if (filteredContacts.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No contacts found.</td></tr>';
            return;
        }

        filteredContacts.forEach(contact => {
            const row = document.createElement('tr');
            row.dataset.rowIndex = contact.rowIndex;

            const isSelected = state.selectedRows.has(contact.rowIndex);

            row.innerHTML = `
                <td><input type="checkbox" class="row-checkbox" ${isSelected ? 'checked' : ''}></td>
                <td>${contact.name} ${contact.surname}</td>
                <td>${contact.agency}</td>
                <td><a class="wa-link" href="${contact.waLink}" target="_blank" rel="noopener noreferrer">WhatsApp</a></td>
                <td>
                    <select class="status-select">
                        ${state.statusOptions.map(opt => `<option value="${opt}" ${contact.status === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>
                </td>
                <td><button class="notes-btn">Notes</button></td>
            `;
            tableBody.appendChild(row);
        });
        updateSelectAllCheckbox();
    };
    
    const updateSelectAllCheckbox = () => {
        const displayedRowIndexes = Array.from(tableBody.querySelectorAll('tr')).map(tr => parseInt(tr.dataset.rowIndex));
        const allDisplayedSelected = displayedRowIndexes.length > 0 && displayedRowIndexes.every(index => state.selectedRows.has(index));
        selectAllCheckbox.checked = allDisplayedSelected;
    };


    // --- Event Handlers ---
    const handleStatusChange = async (rowIndex, newStatus) => {
        const payload = { action: 'updateSingleStatus', payload: { rowIndex, newStatus } };
        const result = await apiCall('', 'POST', payload);

        if (result && result.result === 'success') {
            const contactIndex = state.contacts.findIndex(c => c.rowIndex === rowIndex);
            if (contactIndex > -1) {
                state.contacts[contactIndex] = result.row;
            }
            showToast('Status updated successfully!');
            // Full refresh to ensure stats are correct
            initializeApp();
        } else {
            showToast('Failed to update status.', 'error');
            renderTable(); // Re-render to reset dropdown
        }
    };
    
    const handleBulkUpdate = async () => {
        if (state.selectedRows.size === 0) {
            showToast('No contacts selected.', 'error');
            return;
        }
        const newStatus = bulkStatusSelect.value;
        const rowIndices = Array.from(state.selectedRows);
        const payload = { action: 'bulkUpdateStatus', payload: { rowIndices, newStatus } };
        const result = await apiCall('', 'POST', payload);

        if (result && result.result === 'success') {
            state.selectedRows.clear();
            showToast(result.message);
            initializeApp(); // Full refresh
        } else {
            showToast('Bulk update failed.', 'error');
        }
    };
    
    const handleSaveNote = async () => {
        const rowIndex = state.currentNotesRowIndex;
        const note = notesTextarea.value;
        const payload = { action: 'updateNote', payload: { rowIndex, note } };
        const result = await apiCall('', 'POST', payload);
        
        if (result && result.result === 'success') {
            const contactIndex = state.contacts.findIndex(c => c.rowIndex === rowIndex);
            if (contactIndex > -1) {
                state.contacts[contactIndex] = result.row;
            }
            showToast('Note saved successfully!');
            closeNotesModal();
        } else {
            showToast('Failed to save note.', 'error');
        }
    };
    
    const openNotesModal = (rowIndex) => {
        const contact = state.contacts.find(c => c.rowIndex === rowIndex);
        if (contact) {
            state.currentNotesRowIndex = rowIndex;
            notesModalName.textContent = `${contact.name} ${contact.surname}`;
            notesTextarea.value = contact.notes;
            notesModal.classList.remove('hidden');
        }
    };
    
    const closeNotesModal = () => {
        notesModal.classList.add('hidden');
        state.currentNotesRowIndex = null;
    };
    
    // --- Initializer ---
    const initializeApp = async () => {
        const statsData = await apiCall('?action=stats');
        if (statsData && statsData.result === 'success') {
            renderStats(statsData);
            renderFilterAndBulkOptions(statsData);
        }

        const recipientsData = await apiCall('?action=recipients');
        if (recipientsData && recipientsData.result === 'success') {
            state.contacts = recipientsData.recipients;
            renderTable();
        }
    };

    // --- Event Listeners Setup ---
    statusFilter.addEventListener('change', renderTable);

    tableBody.addEventListener('change', e => {
        const rowIndex = parseInt(e.target.closest('tr').dataset.rowIndex);
        if (e.target.classList.contains('status-select')) {
            handleStatusChange(rowIndex, e.target.value);
        }
        if (e.target.classList.contains('row-checkbox')) {
            if (e.target.checked) {
                state.selectedRows.add(rowIndex);
            } else {
                state.selectedRows.delete(rowIndex);
            }
            updateSelectAllCheckbox();
        }
    });

    tableBody.addEventListener('click', e => {
        if (e.target.classList.contains('notes-btn')) {
            const rowIndex = parseInt(e.target.closest('tr').dataset.rowIndex);
            openNotesModal(rowIndex);
        }
    });



    selectAllCheckbox.addEventListener('change', () => {
        const displayedRowIndexes = Array.from(tableBody.querySelectorAll('tr')).map(tr => parseInt(tr.dataset.rowIndex));
        if (selectAllCheckbox.checked) {
            displayedRowIndexes.forEach(index => state.selectedRows.add(index));
        } else {
            displayedRowIndexes.forEach(index => state.selectedRows.delete(index));
        }
        renderTable();
    });
    
    bulkUpdateBtn.addEventListener('click', handleBulkUpdate);
    notesSaveBtn.addEventListener('click', handleSaveNote);
    notesCloseBtn.addEventListener('click', closeNotesModal);
    notesModal.addEventListener('click', e => {
        if (e.target === notesModal) closeNotesModal(); // Close on overlay click
    });

    // --- Start App ---
    initializeApp();
});
