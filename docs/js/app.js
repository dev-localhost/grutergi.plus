let members = JSON.parse(localStorage.getItem('grutergi_members')) || [];
let attendance = new Set(JSON.parse(localStorage.getItem('grutergi_attendance')) || []);
let cellAttendance = JSON.parse(localStorage.getItem('grutergi_cell_attendance')) || {};
let cellActiveMemberIds = JSON.parse(localStorage.getItem('grutergi_cell_active_members')) || [];
let cellName = localStorage.getItem('grutergi_cell_name') || "";
let cellCheckSettings = JSON.parse(localStorage.getItem('grutergi_cell_check_settings')) || {
    attendance: true,
    pbs: true,
    wednesday: true,
    friday: true
};
let selectedDate = new Date().toISOString().split('T')[0];

let pendingNames = []; // 일괄 추가를 위한 배열
let isAutoAttend = false; // 검색을 통한 추가인지 여부
let currentView = 'stump';
let currentAddContext = 'stump';

const etSearch = document.getElementById('etSearch');
const etCellSearch = document.getElementById('etCellSearch');
const etCellName = document.getElementById('etCellName');
const suggestionBox = document.getElementById('suggestion-box');
const cellSuggestionBox = document.getElementById('cell-suggestion-box');
const settingsSideView = document.getElementById('settingsSideView');

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    // Data Migration: 'meeting' to 'attendance' for cellAttendance
    let migrated = false;
    for (const id in cellAttendance) {
        if (cellAttendance[id].hasOwnProperty('meeting')) {
            cellAttendance[id].attendance = cellAttendance[id].meeting;
            delete cellAttendance[id].meeting;
            migrated = true;
        }
    }
    if (migrated) saveData();

    const stumpDatePicker = document.getElementById('stump-date-picker');
    const cellDatePicker = document.getElementById('cell-date-picker');

    if (stumpDatePicker) {
        stumpDatePicker.value = selectedDate;
        stumpDatePicker.addEventListener('change', (e) => {
            selectedDate = e.target.value;
            if (cellDatePicker) cellDatePicker.value = selectedDate;
            updateUI();
        });
    }

    if (cellDatePicker) {
        cellDatePicker.value = selectedDate;
        cellDatePicker.addEventListener('change', (e) => {
            selectedDate = e.target.value;
            if (stumpDatePicker) stumpDatePicker.value = selectedDate;
            updateUI();
        });
    }

    if (etCellName) {
        etCellName.value = cellName;
        etCellName.addEventListener('input', () => {
            cellName = etCellName.value;
            saveData();
        });
    }

    if (etSearch) {
        etSearch.addEventListener('input', handleAutocomplete);
        etSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSearch();
                hideSuggestions();
            }
        });
    }

    if (etCellSearch) {
        etCellSearch.addEventListener('input', handleCellAutocomplete);
        etCellSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleCellSearch();
                hideCellSuggestions();
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (etSearch && !etSearch.contains(e.target)) {
            hideSuggestions();
        }
        if (etCellSearch && !etCellSearch.contains(e.target)) {
            hideCellSuggestions();
        }
    });

    initDraggableFab();
    updateUI();
});

function initDraggableFab() {
    const fabContainers = document.querySelectorAll('.fab-container');

    fabContainers.forEach(container => {
        let isDragging = false;
        let startX, startY;
        let initialRight = 20;
        let initialBottom = 100;

        // Load saved position
        const savedPos = JSON.parse(localStorage.getItem('grutergi_fab_pos')) || { right: 20, bottom: 100 };
        container.style.right = savedPos.right + 'px';
        container.style.bottom = savedPos.bottom + 'px';

        const onStart = (e) => {
            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

            startX = clientX;
            startY = clientY;

            initialRight = parseInt(window.getComputedStyle(container).right);
            initialBottom = parseInt(window.getComputedStyle(container).bottom);

            isDragging = false; // Reset on start

            const moveHandler = (moveEvent) => {
                const moveX = moveEvent.type === 'touchmove' ? moveEvent.touches[0].clientX : moveEvent.clientX;
                const moveY = moveEvent.type === 'touchmove' ? moveEvent.touches[0].clientY : moveEvent.clientY;

                if (Math.abs(startX - moveX) > 5 || Math.abs(startY - moveY) > 5) {
                    isDragging = true;
                    container.style.transition = 'none';

                    const deltaX = startX - moveX;
                    const deltaY = startY - moveY;

                    const newRight = initialRight + deltaX;
                    const newBottom = initialBottom + deltaY;

                    const finalRight = Math.max(0, Math.min(window.innerWidth - container.offsetWidth, newRight));
                    const finalBottom = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, newBottom));

                    container.style.right = finalRight + 'px';
                    container.style.bottom = finalBottom + 'px';

                    // Sync all containers
                    document.querySelectorAll('.fab-container').forEach(other => {
                        if (other !== container) {
                            other.style.right = container.style.right;
                            other.style.bottom = container.style.bottom;
                        }
                    });
                }
            };

            const endHandler = () => {
                if (isDragging) {
                    container.style.transition = 'transform 0.2s';
                    const pos = {
                        right: parseInt(container.style.right),
                        bottom: parseInt(container.style.bottom)
                    };
                    localStorage.setItem('grutergi_fab_pos', JSON.stringify(pos));
                }
                window.removeEventListener('mousemove', moveHandler);
                window.removeEventListener('mouseup', endHandler);
                window.removeEventListener('touchmove', moveHandler);
                window.removeEventListener('touchend', endHandler);
            };

            window.addEventListener('mousemove', moveHandler);
            window.addEventListener('mouseup', endHandler);
            window.addEventListener('touchmove', moveHandler, { passive: false });
            window.addEventListener('touchend', endHandler);
        };

        container.addEventListener('mousedown', onStart);
        container.addEventListener('touchstart', onStart, { passive: false });

        // Prevent click if dragging
        container.addEventListener('click', (e) => {
            if (isDragging) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
    });
}

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

    const toolbarTitle = document.getElementById('toolbar-title');

    if (view === 'stump') {
        document.getElementById('stump-view').classList.add('active');
        document.getElementById('tab-stump').classList.add('active');
        toolbarTitle.innerText = "그루터기 출석부";
    } else {
        document.getElementById('cell-view').classList.add('active');
        document.getElementById('tab-cell').classList.add('active');
        toolbarTitle.innerText = "셀 출석부";
        renderCellList();
    }
}

function handleAutocomplete() {
    const query = etSearch.value.trim();
    if (!query) {
        hideSuggestions();
        return;
    }

    const matchingMembers = members.filter(m =>
        !attendance.has(m.id) && (m.name.includes(query) || getChosung(m.name).includes(query))
    );

    if (matchingMembers.length > 0) {
        showSuggestions(matchingMembers);
    } else {
        hideSuggestions();
    }
}

function showSuggestions(suggestions) {
    suggestionBox.innerHTML = '';
    suggestions.forEach(member => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            <div class="suggest-info">
                <div class="gender-dot ${member.isMale ? 'male' : 'female'}"></div>
                <span>${member.name}</span>
            </div>
        `;
        item.onclick = () => selectSuggestion(member.id);
        suggestionBox.appendChild(item);
    });
    suggestionBox.style.display = 'block';
}

function hideSuggestions() {
    if (suggestionBox) suggestionBox.style.display = 'none';
}

function selectSuggestion(id) {
    toggleAttendance(id);
    etSearch.value = '';
    hideSuggestions();
}

function handleSearch() {
    const query = etSearch.value.trim();
    if (!query) return;

    const matchingMembers = members.filter(m =>
        m.name.includes(query) || getChosung(m.name).includes(query)
    );

    const notAttended = matchingMembers.filter(m => !attendance.has(m.id));

    if (notAttended.length === 1) {
        toggleAttendance(notAttended[0].id);
        etSearch.value = "";
    } else if (notAttended.length > 1) {
        showSuggestions(notAttended);
    } else {
        if (matchingMembers.length > 0) {
            showToast("이미 출석 처리된 이름입니다.");
            etSearch.value = "";
        } else {
            pendingNames = [query];
            isAutoAttend = true;
            showAddDialog(`'${query}' 신규 등록`, "명단에 없는 이름입니다. 성별을 선택해주세요.");
        }
    }
}

function showAddDialog(title, body) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalBody').innerText = body;
    document.getElementById('addMemberModal').style.display = 'flex';
}

function showConfirmDialog(title, body, onConfirm) {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmBody').innerText = body;
    const btnConfirm = document.getElementById('btnConfirmAction');

    // 이전 이벤트 리스너 제거를 위해 복제 후 교체
    const newBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);

    newBtn.onclick = () => {
        onConfirm();
        closeModal('confirmModal');
    };

    document.getElementById('confirmModal').style.display = 'flex';
}

function openSettings() {
    renderSettingsList();
    settingsSideView.classList.add('open');
}

function closeSideView() {
    settingsSideView.classList.remove('open');
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    if (modalId === 'addMemberModal') {
        etSearch.value = "";
        pendingNames = [];
        isAutoAttend = false;
    }
}

function startBatchAdd() {
    const textarea = document.getElementById('etSettingsAddNames');
    const input = textarea.value.trim();
    if (!input) return;

    pendingNames = input.split(/[\s,]+/).map(s => s.trim()).filter(s => s.length > 0);

    if (pendingNames.length === 0) return;

    isAutoAttend = false;
    showAddDialog("성별 선택", `${pendingNames.length}명의 인원을 추가합니다. 성별을 선택해주세요.`);
}

function processAddMember(isMale) {
    let addedCount = 0;
    pendingNames.forEach(name => {
        if (!members.some(m => m.name === name && m.isMale === isMale)) {
            const newMember = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                name: name,
                isMale: isMale
            };
            members.push(newMember);
            if (isAutoAttend) {
                attendance.add(newMember.id);
            }
            if (currentAddContext === 'cell') {
                if (!cellActiveMemberIds.includes(newMember.id)) {
                    cellActiveMemberIds.push(newMember.id);
                }
            }
            addedCount++;
        }
    });

    saveData();
    updateUI();

    if (!isAutoAttend && currentAddContext !== 'cell') {
        document.getElementById('etSettingsAddNames').value = "";
        renderSettingsList();
    }

    if (currentAddContext === 'cell') {
        etCellSearch.value = "";
    }

    closeModal('addMemberModal');
    currentAddContext = 'stump'; // reset context
    if (addedCount > 0 && !isAutoAttend) {
        showToast(`${addedCount}명이 명단에 추가되었습니다.`);
    }
}

function toggleAttendance(id) {
    if (attendance.has(id)) {
        attendance.delete(id);
    } else {
        attendance.add(id);
    }
    saveData();
    updateUI();
}

function deleteMember(id) {
    showConfirmDialog("인원 삭제", "이 인원을 명단에서 삭제하시겠습니까?", () => {
        members = members.filter(m => m.id !== id);
        attendance.delete(id);
        saveData();
        updateUI();
        renderSettingsList();
        showToast("삭제되었습니다.");
    });
}

function clearMembersByGender(isMale) {
    const genderStr = isMale ? "남자" : "여자";
    showConfirmDialog(`${genderStr} 전체 삭제`, `${genderStr} 명단을 모두 삭제하시겠습니까?`, () => {
        members = members.filter(m => m.isMale !== isMale);
        const currentMemberIds = new Set(members.map(m => m.id));
        attendance = new Set([...attendance].filter(id => currentMemberIds.has(id)));

        saveData();
        updateUI();
        renderSettingsList();
        showToast(`${genderStr} 명단이 전체 삭제되었습니다.`);
    });
}

function clearAllMembers() {
    showConfirmDialog("전체 삭제", "명단을 모두 삭제하시겠습니까?\n(등록된 인원과 출석 기록이 모두 삭제됩니다.)", () => {
        members = [];
        attendance.clear();
        saveData();
        updateUI();
        renderSettingsList();
        showToast("전체 삭제되었습니다.");
    });
}

function confirmReset() {
    showConfirmDialog("출석 초기화", "오늘의 출석 기록을 모두 지우시겠습니까?\n(등록된 명단은 유지됩니다)", () => {
        attendance.clear();
        saveData();
        updateUI();
        showToast("출석 기록이 초기화되었습니다.");
    });
}

function saveData() {
    localStorage.setItem('grutergi_members', JSON.stringify(members));
    localStorage.setItem('grutergi_attendance', JSON.stringify(Array.from(attendance)));
    localStorage.setItem('grutergi_cell_attendance', JSON.stringify(cellAttendance));
    localStorage.setItem('grutergi_cell_active_members', JSON.stringify(cellActiveMemberIds));
    localStorage.setItem('grutergi_cell_name', cellName);
    localStorage.setItem('grutergi_cell_check_settings', JSON.stringify(cellCheckSettings));
}

function updateUI() {
    if (currentView === 'stump') {
        updateStumpUI();
    } else {
        renderCellList();
    }
}

function updateStumpUI() {
    const maleGroup = document.getElementById('cgMalePresent');
    const femaleGroup = document.getElementById('cgFemalePresent');
    if (!maleGroup || !femaleGroup) return;

    maleGroup.innerHTML = "";
    femaleGroup.innerHTML = "";
    let maleCount = 0, femaleCount = 0;

    const attendedMembers = members
        .filter(m => attendance.has(m.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    attendedMembers.forEach(member => {
        const chip = document.createElement('div');
        chip.className = `chip ${member.isMale ? 'male' : 'female'}`;
        chip.innerHTML = `${member.name} <span class="close-btn" onclick="toggleAttendance('${member.id}')"><span class="material-symbols-rounded">close</span></span>`;
        if (member.isMale) {
            maleGroup.appendChild(chip);
            maleCount++;
        } else {
            femaleGroup.appendChild(chip);
            femaleCount++;
        }
    });

    document.getElementById('tvAttendanceCount').innerText = maleCount + femaleCount;
    document.getElementById('tvMaleCount').innerText = maleCount;
    document.getElementById('tvFemaleCount').innerText = femaleCount;
}

function handleCellAutocomplete() {
    const query = etCellSearch.value.trim();
    if (!query) {
        hideCellSuggestions();
        renderCellList();
        return;
    }

    const matchingMembers = members.filter(m =>
        !cellActiveMemberIds.includes(m.id) &&
        (m.name.toLowerCase().includes(query.toLowerCase()) || getChosung(m.name).includes(query.toLowerCase()))
    );

    if (matchingMembers.length > 0) {
        showCellSuggestions(matchingMembers);
    } else {
        hideCellSuggestions();
    }
    renderCellList();
}

function showCellSuggestions(suggestions) {
    if (!cellSuggestionBox) return;
    cellSuggestionBox.innerHTML = '';
    suggestions.forEach(member => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            <div class="suggest-info">
                <div class="gender-dot ${member.isMale ? 'male' : 'female'}"></div>
                <span>${member.name}</span>
            </div>
        `;
        item.onclick = () => selectCellSuggestion(member.id);
        cellSuggestionBox.appendChild(item);
    });
    cellSuggestionBox.style.display = 'block';
}

function hideCellSuggestions() {
    if (cellSuggestionBox) cellSuggestionBox.style.display = 'none';
}

function selectCellSuggestion(id) {
    if (!cellActiveMemberIds.includes(id)) {
        cellActiveMemberIds.push(id);
    }
    saveData();
    etCellSearch.value = '';
    hideCellSuggestions();
    renderCellList();
}

function handleCellSearch() {
    const query = etCellSearch.value.trim();
    if (!query) return;

    const matchingMembers = members.filter(m =>
        m.name.includes(query) || getChosung(m.name).includes(query)
    );

    const notActive = matchingMembers.filter(m => !cellActiveMemberIds.includes(m.id));

    if (notActive.length === 1) {
        selectCellSuggestion(notActive[0].id);
    } else if (notActive.length > 1) {
        showCellSuggestions(notActive);
    } else {
        if (matchingMembers.length > 0) {
            showToast("이미 목록에 있는 이름입니다.");
            etCellSearch.value = "";
        } else {
            pendingNames = [query];
            isAutoAttend = false;
            currentAddContext = 'cell';
            showAddDialog(`'${query}' 신규 등록`, "명단에 없는 이름입니다. 성별을 선택해주세요.");
        }
    }
}

function renderCellList() {
    const listContainer = document.getElementById('cellMemberList');
    const statsCard = document.getElementById('cellStatsCard');
    if (!listContainer || !statsCard) return;

    const query = etCellSearch.value.trim();

    // activeMembers mapping
    const activeMembers = cellActiveMemberIds
        .map(id => members.find(m => m.id === id))
        .filter(m => m); // remove nulls if member deleted from settings

    const filteredMembers = activeMembers
        .filter(m => {
            const name = m.name.toLowerCase();
            const chosung = getChosung(name);
            const lowerQuery = query.toLowerCase();
            return name.includes(lowerQuery) || chosung.includes(lowerQuery);
        });

    listContainer.innerHTML = '';

    let attendanceCount = 0;
    let pbsCount = 0;
    let wednesdayCount = 0;
    let fridayCount = 0;

    filteredMembers.forEach((member, index) => {
        const data = cellAttendance[member.id] || { attendance: false, pbs: false, wednesday: false, friday: false };
        if (data.attendance) attendanceCount++;
        if (data.pbs) pbsCount++;
        if (data.wednesday) wednesdayCount++;
        if (data.friday) fridayCount++;

        const item = document.createElement('div');
        item.className = 'cell-member-item';
        item.draggable = true;
        item.dataset.id = member.id;
        item.dataset.index = index;

        let checkButtonsHtml = '';
        if (cellCheckSettings.attendance) {
            checkButtonsHtml += `
                <div class="cell-check-btn ${data.attendance ? 'active' : ''}" onclick="toggleCellAttendance('${member.id}', 'attendance')">
                    <div class="checkbox"><span class="material-symbols-rounded">check</span></div>
                    <span class="label">출석</span>
                </div>`;
        }
        if (cellCheckSettings.pbs) {
            checkButtonsHtml += `
                <div class="cell-check-btn ${data.pbs ? 'active' : ''}" onclick="toggleCellAttendance('${member.id}', 'pbs')">
                    <div class="checkbox"><span class="material-symbols-rounded">check</span></div>
                    <span class="label">PBS</span>
                </div>`;
        }
        if (cellCheckSettings.wednesday) {
            checkButtonsHtml += `
                <div class="cell-check-btn ${data.wednesday ? 'active' : ''}" onclick="toggleCellAttendance('${member.id}', 'wednesday')">
                    <div class="checkbox"><span class="material-symbols-rounded">check</span></div>
                    <span class="label">수요</span>
                </div>`;
        }
        if (cellCheckSettings.friday) {
            checkButtonsHtml += `
                <div class="cell-check-btn ${data.friday ? 'active' : ''}" onclick="toggleCellAttendance('${member.id}', 'friday')">
                    <div class="checkbox"><span class="material-symbols-rounded">check</span></div>
                    <span class="label">금요</span>
                </div>`;
        }

        item.innerHTML = `
            <span class="material-symbols-rounded drag-handle">drag_indicator</span>
            <div class="cell-member-info">
                <div class="gender-dot ${member.isMale ? 'male' : 'female'}"></div>
                <span class="cell-member-name">${member.name}</span>
            </div>
            <div class="cell-checkboxes">
                ${checkButtonsHtml}
            </div>
            <button class="btn-item-delete" onclick="removeMemberFromCell('${member.id}')" title="명단에서 제외">
                <span class="material-symbols-rounded">close</span>
            </button>
        `;

        // Drag events
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('dragend', handleDragEnd);

        const handle = item.querySelector('.drag-handle');
        handle.addEventListener('touchstart', handleTouchStart, { passive: false });
        handle.addEventListener('touchmove', handleTouchMove, { passive: false });
        handle.addEventListener('touchend', handleTouchEnd);

        listContainer.appendChild(item);
    });

    // Update Stats Card Dynamically
    let statsHtml = `
        <div class="stat-item">
            <span class="count total-count">${filteredMembers.length}</span>
            <span class="label">전체</span>
        </div>
    `;

    if (cellCheckSettings.attendance) {
        statsHtml += `
            <div class="stat-item">
                <span class="count male-color">${attendanceCount}</span>
                <span class="label">출석</span>
            </div>
        `;
    }
    if (cellCheckSettings.pbs) {
        statsHtml += `
            <div class="stat-item">
                <span class="count female-color">${pbsCount}</span>
                <span class="label">PBS</span>
            </div>
        `;
    }
    if (cellCheckSettings.wednesday) {
        statsHtml += `
            <div class="stat-item">
                <span class="count male-color" style="color: #5856D6;">${wednesdayCount}</span>
                <span class="label">수요</span>
            </div>
        `;
    }
    if (cellCheckSettings.friday) {
        statsHtml += `
            <div class="stat-item">
                <span class="count female-color" style="color: #FF9500;">${fridayCount}</span>
                <span class="label">금요</span>
            </div>
        `;
    }
    statsCard.innerHTML = statsHtml;
}

let dragSrcEl = null;
let touchSrcEl = null;
let touchStartY = 0;

function handleTouchStart(e) {
    const item = this.closest('.cell-member-item');
    touchSrcEl = item;
    touchStartY = e.touches[0].clientY;
    item.classList.add('dragging');

    // 핵심: 안드로이드 등에서 스크롤 간섭을 최소화하기 위해 passive: false와 함께 사용
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
}

function handleTouchMove(e) {
    if (!touchSrcEl) return;

    if (e.cancelable) e.preventDefault(); // 스크롤 완전히 차단

    const touch = e.touches[0];
    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!targetEl) return;

    const dropTarget = targetEl.closest('.cell-member-item');

    if (dropTarget && dropTarget !== touchSrcEl) {
        const list = touchSrcEl.parentNode;
        const items = Array.from(list.children);
        const srcIndex = items.indexOf(touchSrcEl);
        const targetIndex = items.indexOf(dropTarget);

        if (srcIndex < targetIndex) {
            list.insertBefore(touchSrcEl, dropTarget.nextSibling);
        } else {
            list.insertBefore(touchSrcEl, dropTarget);
        }
    }
}

function handleTouchEnd(e) {
    if (!touchSrcEl) return;
    touchSrcEl.classList.remove('dragging');

    // Save new order
    const list = touchSrcEl.parentNode;
    const newOrder = Array.from(list.children).map(item => item.dataset.id);
    cellActiveMemberIds = newOrder;
    saveData();

    touchSrcEl = null;
    renderCellList(); // Refresh to update indices etc.
}

function handleDragStart(e) {
    this.classList.add('dragging');
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    return false;
}

function handleDragEnter() { this.classList.add('over'); }
function handleDragLeave() { this.classList.remove('over'); }

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    if (dragSrcEl !== this) {
        const fromId = dragSrcEl.dataset.id;
        const toId = this.dataset.id;

        const fromIndex = cellActiveMemberIds.indexOf(fromId);
        const toIndex = cellActiveMemberIds.indexOf(toId);

        if (fromIndex !== -1 && toIndex !== -1) {
            const [movedId] = cellActiveMemberIds.splice(fromIndex, 1);
            cellActiveMemberIds.splice(toIndex, 0, movedId);

            saveData();
            renderCellList();
        }
    }
    return false;
}

function handleDragEnd() {
    this.classList.remove('dragging');
    const items = document.querySelectorAll('.cell-member-item');
    items.forEach(item => item.classList.remove('over'));
}

function removeMemberFromCell(id) {
    cellActiveMemberIds = cellActiveMemberIds.filter(mid => mid !== id);
    saveData();
    renderCellList();
}

function openCellSettings() {
    document.getElementById('checkItemAttendance').checked = cellCheckSettings.attendance;
    document.getElementById('checkItemPbs').checked = cellCheckSettings.pbs;
    document.getElementById('checkItemWednesday').checked = cellCheckSettings.wednesday;
    document.getElementById('checkItemFriday').checked = cellCheckSettings.friday;
    document.getElementById('cellSettingsModal').style.display = 'flex';
}

function saveCellSettings() {
    cellCheckSettings = {
        attendance: document.getElementById('checkItemAttendance').checked,
        pbs: document.getElementById('checkItemPbs').checked,
        wednesday: document.getElementById('checkItemWednesday').checked,
        friday: document.getElementById('checkItemFriday').checked
    };
    saveData();
    closeModal('cellSettingsModal');
    renderCellList();
}

function toggleCellAttendance(memberId, type) {
    if (!cellAttendance[memberId]) {
        cellAttendance[memberId] = { attendance: false, pbs: false, wednesday: false, friday: false };
    }
    cellAttendance[memberId][type] = !cellAttendance[memberId][type];
    saveData();
    renderCellList();
}

function confirmCellReset() {
    document.getElementById('resetOptionsModal').style.display = 'flex';
}

function resetCellAttendanceOnly() {
    cellAttendance = {};
    saveData();
    renderCellList();
    closeModal('resetOptionsModal');
    showToast("체크 기록이 초기화되었습니다.");
}

function resetCellFull() {
    cellAttendance = {};
    cellActiveMemberIds = [];
    saveData();
    renderCellList();
    closeModal('resetOptionsModal');
    showToast("명단과 기록이 모두 초기화되었습니다.");
}

function copyCellAttendance() {
    const displayName = cellName.trim() || "OOO";
    const dateArr = selectedDate.split('-');
    const dateStr = `${parseInt(dateArr[1])}/${parseInt(dateArr[2])}`;

    const activeMembers = cellActiveMemberIds
        .map(id => members.find(m => m.id === id))
        .filter(m => m);

    let text = `📍 [${displayName}] ${dateStr}\n━━━━━━━━━━━━━━\n`;

    let hasData = false;

    if (cellCheckSettings.attendance) {
        const list = activeMembers.filter(m => cellAttendance[m.id]?.attendance).map(m => m.name);
        if (list.length > 0) {
            text += `✅ 출석 (${list.length}명)\n${list.join(" ")}\n\n`;
            hasData = true;
        }
    }
    if (cellCheckSettings.pbs) {
        const list = activeMembers.filter(m => cellAttendance[m.id]?.pbs).map(m => m.name);
        if (list.length > 0) {
            text += `📖 PBS (${list.length}명)\n${list.join(" ")}\n\n`;
            hasData = true;
        }
    }
    if (cellCheckSettings.wednesday) {
        const list = activeMembers.filter(m => cellAttendance[m.id]?.wednesday).map(m => m.name);
        if (list.length > 0) {
            text += `⛪ 수요예배 (${list.length}명)\n${list.join(" ")}\n\n`;
            hasData = true;
        }
    }
    if (cellCheckSettings.friday) {
        const list = activeMembers.filter(m => cellAttendance[m.id]?.friday).map(m => m.name);
        if (list.length > 0) {
            text += `🔥 금요기도회 (${list.length}명)\n${list.join(" ")}\n\n`;
            hasData = true;
        }
    }

    if (!hasData) {
        text += "체크된 내역이 없습니다.";
    }

    text = text.trim();

    navigator.clipboard.writeText(text).then(() => {
        showToast("출석 현황이 클립보드에 복사되었습니다.");
    }).catch(err => {
        console.error('복사 실패:', err);
        showToast("복사에 실패했습니다.");
    });
}

function renderSettingsList() {
    const container = document.getElementById('settingsMemberListContainer');
    const statsContainer = document.getElementById('settingsStats');
    if (!container || !statsContainer) return;

    container.innerHTML = '';

    const maleList = members.filter(m => m.isMale);
    const femaleList = members.filter(m => !m.isMale);
    const totalCount = members.length;

    statsContainer.innerHTML = `
        <div class="stat-item">
            <span class="count total-count">${totalCount}</span>
            <span class="label">전체</span>
        </div>
        <div class="stat-item">
            <span class="count male-color">${maleList.length}</span>
            <span class="label">남</span>
        </div>
        <div class="stat-item">
            <span class="count female-color">${femaleList.length}</span>
            <span class="label">여</span>
        </div>
    `;

    if (members.length === 0) {
        container.innerHTML = "<div style='text-align:center; color:#888; padding:20px;'>등록된 인원이 없습니다.</div>";
        return;
    }

    const renderGenderGroup = (list, isMale) => {
        if (list.length === 0) return '';

        const grouped = list.reduce((acc, member) => {
            const chosung = getChosung(member.name.charAt(0));
            if (!acc[chosung]) acc[chosung] = [];
            acc[chosung].push(member);
            return acc;
        }, {});

        let html = `
            <div class="gender-main-group ${isMale ? 'male' : 'female'}">
                <div class="gender-main-label ${isMale ? 'male-color' : 'female-color'}">
                    ${isMale ? '남' : '여'}
                </div>
        `;

        Object.keys(grouped).sort().forEach(chosung => {
            const sortedMembers = grouped[chosung].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
            html += `
                <div class="chosung-group">
                    <div class="chosung-label">${chosung}</div>
                    <div class="member-chips">
                        ${sortedMembers.map(m => `
                            <div class="member-chip ${isMale ? 'male' : 'female'}">
                                <span>${m.name}</span>
                                <span class="del-btn" onclick="deleteMember('${m.id}')">
                                    <span class="material-symbols-rounded">cancel</span>
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        return html;
    };

    container.innerHTML = renderGenderGroup(maleList, true) + renderGenderGroup(femaleList, false);
}

function shareAttendance() {
    const dateArr = selectedDate.split('-');
    const dateStr = `${parseInt(dateArr[1])}/${parseInt(dateArr[2])}`;

    const maleList = members.filter(m => m.isMale && attendance.has(m.id)).map(m => m.name).sort();
    const femaleList = members.filter(m => !m.isMale && attendance.has(m.id)).map(m => m.name).sort();
    const text = `[그루터기 출석 현황]\n📅 ${dateStr}\n\n전체 ${attendance.size}명\n\n남 ${maleList.length}명\n${maleList.join(" ")}\n\n여 ${femaleList.length}명\n${femaleList.join(" ")}`;

    if (navigator.share) {
        navigator.share({ text: text });
    } else {
        navigator.clipboard.writeText(text).then(() => {
            showToast("출석 현황이 클립보드에 복사되었습니다.");
        });
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}
function getChosung(str) {
    if (!str) return "";
    const chosungs = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
    return str.split('').map(char => {
        const code = char.charCodeAt(0) - 44032;
        if (code >= 0 && code < 11172) return chosungs[Math.floor(code / 588)];
        return char;
    }).join('');
}
