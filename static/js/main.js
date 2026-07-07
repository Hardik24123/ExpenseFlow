document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('expenseflow_token');
    
    // --- JWT DECODER ---
    function parseJwt (token) {
        if(!token) return null;
        try {
            var base64Url = token.split('.')[1];
            var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) { return null; }
    }
    const currentUser = parseJwt(token);
    const currentUserId = currentUser ? currentUser.sub : null;

    // --- 1. AUTHENTICATION & NAVBAR ---
    const userName = localStorage.getItem('expenseflow_name') || 'User';
    
    if (token && document.getElementById('userDisplayName')) {
        document.getElementById('userDisplayName').textContent = `User: ${userName}`;
        document.getElementById('userDisplayName').classList.remove('d-none');
        
        const logoutBtn = document.getElementById('navLoginBtn');
        if (logoutBtn) {
            logoutBtn.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket me-1"></i> Sign Out';
            logoutBtn.classList.replace('grad-primary', 'btn-outline-danger');
            logoutBtn.classList.add('bg-white');
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.clear();
                window.location.href = '/login'; 
            });
        }
    }

    if (document.getElementById('dashboardUser')) {
        document.getElementById('dashboardUser').textContent = userName;
    }

    // --- 2. LOGIN / REGISTER HANDLING ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Authenticating...';
            submitBtn.disabled = true;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: document.getElementById('emailInput').value, 
                        password: document.getElementById('passwordInput').value 
                    }) 
                });
                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('expenseflow_token', data.access_token);
                    localStorage.setItem('expenseflow_name', data.name);
                    window.location.href = '/'; 
                } else { alert('Authentication failed: ' + (data.error || 'Unknown error')); }
            } catch (error) { alert('Connection failure.'); } 
            finally { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('regPasswordInput').value;
            const confirmPassword = document.getElementById('regConfirmPasswordInput').value;
            const submitBtn = registerForm.querySelector('button[type="submit"]');
            
            if (password !== confirmPassword) return alert("Verification mismatch.");
            
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Provisioning...';
            submitBtn.disabled = true;

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        name: document.getElementById('regNameInput').value, 
                        email: document.getElementById('regEmailInput').value, 
                        password: password 
                    })
                });
                if (response.ok) {
                    alert('System provisioned. Please authenticate.');
                    window.location.href = '/login';
                } else { alert('Provisioning failed.'); }
            } catch (error) { alert('Connection failure.'); } 
            finally { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }
        });
    }

    // --- 3. DYNAMICALLY LOAD GROUPS & PERSONAL OPTION ---
    async function populateGroupDropdowns() {
        if(!token) return;
        try {
            const res = await fetch('/api/groups/list', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            window.userGroups = data.groups || []; 

            const expGroupSelect = document.getElementById('expGroup');
            if (expGroupSelect) {
                expGroupSelect.innerHTML = '<option value="personal">Personal (No Squad)</option>'; 
                if(data.groups && data.groups.length > 0) {
                    data.groups.forEach(g => { expGroupSelect.innerHTML += `<option value="${g.id}">Squad: ${g.name}</option>`; });
                }
            }
        } catch(e) { console.error("Group load error"); }
    }
    populateGroupDropdowns();

    // --- 4. SMART SPLITTING & UI LOGIC ---
    const addExpenseForm = document.getElementById('addExpenseForm');
    const splitMethodSelect = document.getElementById('expSplitMethod');
    const dynamicSplitContainer = document.getElementById('dynamicSplitContainer');
    const splitMembersList = document.getElementById('splitMembersList');
    const expGroupSelect = document.getElementById('expGroup');
    const expPayerSelect = document.getElementById('expPayer');

    function validateSplits() {
        if (!splitMethodSelect) return true;
        const method = splitMethodSelect.value;
        if (method === 'equal') return true;

        const inputs = document.querySelectorAll('.split-detail-input');
        let totalAllocated = 0;
        inputs.forEach(input => totalAllocated += (parseFloat(input.value) || 0));
        
        const validationMsg = document.getElementById('splitValidationMessage');
        const submitBtn = document.querySelector('#addExpenseForm button[type="submit"]');
        const billAmount = parseFloat(document.getElementById('expAmount').value) || 0;
        
        if (validationMsg) validationMsg.classList.remove('d-none');

        if (method === 'percentage') {
            if (totalAllocated !== 100) {
                if (validationMsg) {
                    validationMsg.className = 'mt-3 alert alert-warning py-2 small fw-bold text-center border-0 shadow-sm';
                    validationMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-1"></i> Allocated: ${totalAllocated}% (Must equal 100%)`;
                }
                if (submitBtn) submitBtn.disabled = true;
                return false;
            }
        } else if (method === 'custom') {
            if (totalAllocated !== billAmount) {
                if (validationMsg) {
                    validationMsg.className = 'mt-3 alert alert-warning py-2 small fw-bold text-center border-0 shadow-sm';
                    validationMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-1"></i> Allocated: ₹${totalAllocated} (Must equal ₹${billAmount})`;
                }
                if (submitBtn) submitBtn.disabled = true;
                return false;
            }
        }
        
        if (validationMsg) {
            validationMsg.className = 'mt-3 alert alert-success py-2 small fw-bold text-center border-0 shadow-sm';
            validationMsg.innerHTML = `<i class="fa-solid fa-check-circle me-1"></i> Perfect allocation.`;
        }
        if (submitBtn) submitBtn.disabled = false;
        return true;
    }

    function renderSplitUI() {
        if (!splitMethodSelect || !dynamicSplitContainer || !expGroupSelect) return;
        const method = splitMethodSelect.value;
        const groupId = expGroupSelect.value;
        const submitBtn = document.querySelector('#addExpenseForm button[type="submit"]');
        const validationMsg = document.getElementById('splitValidationMessage');
        
        // --- FIX: Dynamic "Paid By" Dropdown ---
        if (groupId === 'personal' || !groupId) {
            splitMethodSelect.disabled = true;
            if(expPayerSelect) { 
                expPayerSelect.innerHTML = '<option value="current_user">Me</option>';
                expPayerSelect.disabled = true; 
            }
            dynamicSplitContainer.classList.add('d-none');
            if (submitBtn) submitBtn.disabled = false; 
            if (validationMsg) validationMsg.classList.add('d-none');
            return;
        } else {
            splitMethodSelect.disabled = false;
            
            // Load specific User IDs into Paid By Dropdown
            if (expPayerSelect) {
                expPayerSelect.disabled = false;
                const previousPayer = expPayerSelect.value; 
                expPayerSelect.innerHTML = '<option value="current_user">Me</option>';
                const activeGrp = window.userGroups ? window.userGroups.find(g => g.id === groupId) : null;
                
                if (activeGrp) {
                    activeGrp.members.forEach(member => {
                        if (member !== currentUserId) {
                            expPayerSelect.innerHTML += `<option value="${member}">${member.substring(0,8)}</option>`;
                        }
                    });
                }
                if (Array.from(expPayerSelect.options).some(opt => opt.value === previousPayer)) {
                    expPayerSelect.value = previousPayer;
                }
            }
        }
        
        if (method === 'equal') {
            dynamicSplitContainer.classList.add('d-none');
            if (submitBtn) submitBtn.disabled = false; 
            if (validationMsg) validationMsg.classList.add('d-none');
            return;
        }
        
        dynamicSplitContainer.classList.remove('d-none');
        const activeGroup = window.userGroups ? window.userGroups.find(g => g.id === groupId) : null;
        
        splitMembersList.innerHTML = '';
        if(activeGroup) {
            const symbol = method === 'percentage' ? '%' : '₹';
            activeGroup.members.forEach(member => {
                const isMe = member === currentUserId;
                const displayId = isMe ? 'You' : member.substring(0, 8);
                splitMembersList.innerHTML += `
                    <div class="col-12 col-sm-6">
                        <label class="small fw-bold text-secondary mb-1">${displayId}</label>
                        <div class="input-group shadow-sm">
                            <span class="input-group-text bg-white border-end-0 text-muted">${symbol}</span>
                            <input type="number" class="form-control bg-white border-start-0 split-detail-input" data-member="${member}" placeholder="0" step="0.01" required>
                        </div>
                    </div>
                `;
            });
            document.querySelectorAll('.split-detail-input').forEach(input => input.addEventListener('input', validateSplits));
            const amountInput = document.getElementById('expAmount');
            if (amountInput) amountInput.addEventListener('input', validateSplits);
            validateSplits(); 
        }
    }

    if (splitMethodSelect) splitMethodSelect.addEventListener('change', renderSplitUI);
    if (expGroupSelect) expGroupSelect.addEventListener('change', renderSplitUI);

    if (addExpenseForm) {
        addExpenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = addExpenseForm.querySelector('button[type="submit"]');
            
            const payerValue = expPayerSelect && !expPayerSelect.disabled ? expPayerSelect.value : 'current_user';
            const splitMethodValue = splitMethodSelect.disabled ? 'personal' : splitMethodSelect.value;
            
            let splitDetails = {};
            if (splitMethodValue !== 'equal' && splitMethodValue !== 'personal') {
                document.querySelectorAll('.split-detail-input').forEach(input => {
                    splitDetails[input.dataset.member] = parseFloat(input.value) || 0;
                });
            }

            const payload = {
                title: document.getElementById('expTitle').value,
                amount: document.getElementById('expAmount').value,
                date: document.getElementById('expDate') ? document.getElementById('expDate').value : new Date().toISOString().split('T')[0],
                category: document.getElementById('expCategory').value,
                group_id: document.getElementById('expGroup').value,
                paid_by: payerValue,
                split_method: splitMethodValue,
                split_details: splitDetails 
            };
            
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
            submitBtn.disabled = true;

            try {
                const response = await fetch('/api/expenses/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (response.ok) { window.location.reload(); } 
                else { throw new Error(data.error || 'Transaction failed.'); }
            } catch (error) {
                alert(error.message);
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Save Transaction';
            }
        });
    }

    // --- 5. DASHBOARD MATRIX RENDERING ---
    const dashRecentActivity = document.getElementById('dashRecentActivity');
    const statTotalSpent = document.getElementById('stat-total-spent');
    const statTotalOwed = document.getElementById('stat-total-owed');
    const statYouOwe = document.getElementById('stat-you-owe');
    const statNetBalance = document.getElementById('stat-net-balance');

    if (statTotalSpent || dashRecentActivity) {
        const fetchDashboardData = async () => {
            if (!token) return; 
            try {
                const response = await fetch('/api/expenses/summary', { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await response.json();
                
                if (response.ok) {
                    const totalSpentValue = parseFloat(data.total_spent || 0);
                    const totalOwedValue = parseFloat(data.total_owed || 0);
                    const youOweValue = parseFloat(data.total_you_owe || 0);
                    const netStandingValue = totalOwedValue - youOweValue;

                    if (statTotalSpent) statTotalSpent.textContent = `₹${totalSpentValue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
                    if (statTotalOwed) statTotalOwed.textContent = `₹${totalOwedValue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
                    if (statYouOwe) statYouOwe.textContent = `₹${youOweValue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
                    
                    if (statNetBalance) {
                        statNetBalance.textContent = `₹${Math.abs(netStandingValue).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
                        if (netStandingValue >= 0) {
                            statNetBalance.className = "fw-extrabold text-success mt-2 mb-0";
                        } else {
                            statNetBalance.className = "fw-extrabold text-danger mt-2 mb-0";
                            statNetBalance.textContent = `-₹${Math.abs(netStandingValue).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
                        }
                    }

                    if (dashRecentActivity) {
                        dashRecentActivity.innerHTML = ''; 
                        if (!data.recent_activity || data.recent_activity.length === 0) {
                            dashRecentActivity.innerHTML = `<div class="text-center text-muted small fw-medium py-3">No ledger records found.</div>`;
                        } else {
                            data.recent_activity.forEach(exp => {
                                let icon = exp.type === 'settlement' ? 'fa-handshake' : 'fa-receipt';
                                let color = exp.type === 'settlement' ? 'success' : 'primary';
                                dashRecentActivity.innerHTML += `
                                    <div class="d-flex align-items-center mb-3 p-3 bg-light rounded-3 border-0 hover-lift">
                                        <div class="bg-${color} bg-opacity-10 text-${color} rounded d-flex align-items-center justify-content-center me-3" style="width: 45px; height: 45px;">
                                            <i class="fa-solid ${icon} fa-lg"></i>
                                        </div>
                                        <div class="flex-grow-1">
                                            <h6 class="mb-1 fw-bold text-dark">${exp.title}</h6>
                                            <small class="text-muted fw-medium">${exp.date}</small>
                                        </div>
                                        <div class="text-end"><h6 class="mb-1 fw-bold text-dark">₹${parseFloat(exp.amount).toLocaleString('en-IN')}</h6></div>
                                    </div>
                                `;
                            });
                        }
                    }
                }
            } catch (error) { console.error("Summary fault:", error); }
        };
        fetchDashboardData();
    }

    // --- 6. TIMELINE LEDGER ---
    const timelineTableBody = document.getElementById('timelineTableBody');
    if (timelineTableBody && currentUserId) {
        const loadTimeline = async () => {
            try {
                const response = await fetch('/api/expenses/timeline', { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await response.json();
                
                timelineTableBody.innerHTML = ''; 
                if (!data.timeline || data.timeline.length === 0) {
                    timelineTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted fw-medium fs-5">No transactions found.</td></tr>';
                    return;
                }

                data.timeline.forEach(item => {
                    const isSettlement = item.type === 'settlement';
                    let textClass = 'text-dark';
                    let netText = '';
                    
                    if (isSettlement) {
                        if (item.paid_by === currentUserId) {
                            textClass = 'text-success';
                            netText = `<small class="d-block text-success fw-bold">You Paid ₹${parseFloat(item.amount).toFixed(2)}</small>`;
                        } else if (item.paid_to === currentUserId) {
                            textClass = 'text-success';
                            netText = `<small class="d-block text-success fw-bold">You Received ₹${parseFloat(item.amount).toFixed(2)}</small>`;
                        }
                    } else {
                        const iPaid = item.paid_by === currentUserId || item.paid_by === 'current_user';
                        const totalPaid = iPaid ? parseFloat(item.amount) : 0;
                        const myShare = (item.splits && item.splits[currentUserId]) ? parseFloat(item.splits[currentUserId]) : 0;
                        const netImpact = totalPaid - myShare;

                        if (netImpact > 0.01) {
                            textClass = 'text-success';
                            netText = `<small class="d-block text-success fw-bold">You Lent ₹${netImpact.toFixed(2)}</small>`;
                        } else if (netImpact < -0.01) {
                            textClass = 'text-danger';
                            netText = `<small class="d-block text-danger fw-bold">You Borrowed ₹${Math.abs(netImpact).toFixed(2)}</small>`;
                        } else if (myShare > 0) {
                            textClass = 'text-secondary';
                            netText = `<small class="d-block text-secondary fw-bold">You Paid Your Share</small>`;
                        } else {
                            textClass = 'text-secondary';
                            netText = `<small class="d-block text-secondary fw-bold">Not Involved</small>`;
                        }
                    }

                    const icon = isSettlement ? '<i class="fa-solid fa-handshake text-success me-2"></i>' : '<i class="fa-solid fa-receipt text-primary me-2"></i>';
                    let badgeColor = isSettlement ? 'success' : (item.category === 'Food' ? 'warning' : 'primary');
                    
                    timelineTableBody.innerHTML += `
                        <tr class="transition-all hover-lift">
                            <td class="px-4 text-muted fw-semibold small">${item.date}</td>
                            <td class="py-3">
                                <div class="fw-bold fs-6 mb-1 d-flex align-items-center text-dark">${icon} ${item.title}</div>
                                <span class="badge bg-${badgeColor} bg-opacity-10 text-${badgeColor} rounded-pill px-3 py-1 fw-bold">${item.category}</span>
                            </td>
                            <td class="fw-bold text-secondary small">${(item.paid_by === currentUserId || item.paid_by === 'current_user') ? '<span class="badge bg-dark">You</span>' : item.paid_by.substring(0,8)}</td>
                            <td class="text-end px-4">
                                <div class="fw-bolder ${textClass} fs-5 mb-0">₹${parseFloat(item.amount).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                                ${netText}
                            </td>
                        </tr>
                    `;
                });
            } catch (error) {
                timelineTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-danger fw-bold fs-5">Failed to load ledger data.</td></tr>';
            }
        };
        loadTimeline();
    }

    // --- 7. SQUADS & "WHO OWES WHO" ---
    const groupsContainer = document.getElementById('dynamicGroupsContainer');
    if (groupsContainer) {
        const fetchMyGroups = async () => {
            if (!token) return;
            try {
                const response = await fetch('/api/groups/list', { headers: { 'Authorization': `Bearer ${token}` } });
                if (!response.ok) {
                    throw new Error(response.status === 429 ? "Server is busy (Rate Limited). Please wait a moment and refresh." : "Failed to load groups.");
                }
                const data = await response.json();
                
                groupsContainer.innerHTML = ''; 
                if (data.groups.length === 0) return groupsContainer.innerHTML = `<div class="col-12 text-center text-muted mt-5 fw-bold">No squads found.</div>`;
                
                for (const group of data.groups) {
                    let balancesHtml = '<div class="text-muted small mb-2 fw-medium">Calculating net positions...</div>';
                    try {
                        const balRes = await fetch(`/api/groups/${group.id}/balances`, { headers: { 'Authorization': `Bearer ${token}` } });
                        const balData = await balRes.json();
                        if (balRes.ok && balData.balances) {
                            balancesHtml = '';
                            let isSettled = true;
                            for (const [member, amount] of Object.entries(balData.balances)) {
                                const displayName = member.substring(0,8);
                                if (amount > 0) {
                                    balancesHtml += `<div class="d-flex justify-content-between small fw-bold text-success bg-success bg-opacity-10 rounded px-2 py-1 mb-1 border border-success border-opacity-25"><span>${displayName} owes you:</span> <span>₹${amount.toFixed(2)}</span></div>`;
                                    isSettled = false;
                                } else if (amount < 0) {
                                    balancesHtml += `<div class="d-flex justify-content-between small fw-bold text-danger bg-danger bg-opacity-10 rounded px-2 py-1 mb-1 border border-danger border-opacity-25"><span>You owe ${displayName}:</span> <span>₹${Math.abs(amount).toFixed(2)}</span></div>`;
                                    isSettled = false;
                                }
                            }
                            if (isSettled) balancesHtml = '<div class="small fw-bold text-muted bg-light rounded px-2 py-1 border d-flex justify-content-center align-items-center"><i class="fa-solid fa-check-circle text-success me-2"></i> All Settled Up!</div>';
                        }
                    } catch (e) { balancesHtml = '<div class="text-danger small">Balance error</div>'; }

                    groupsContainer.innerHTML += `
                        <div class="col">
                            <div class="glass-card h-100 p-4 bg-white hover-lift shadow-sm d-flex flex-column">
                                <div class="d-flex justify-content-between align-items-start mb-3">
                                    <div class="bg-primary bg-opacity-10 text-primary rounded d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
                                        <i class="fa-solid fa-network-wired fa-lg"></i>
                                    </div>
                                </div>
                                <h5 class="fw-bolder text-dark mb-1">${group.name}</h5>
                                <p class="text-muted small fw-medium mb-3">Nodes: ${group.members.length}</p>
                                
                                <div class="mb-4 flex-grow-1">
                                    <h6 class="small fw-bolder text-uppercase tracking-wide text-muted mb-2 border-bottom pb-1">Net Positions</h6>
                                    ${balancesHtml}
                                </div>

                                <button class="btn btn-outline-success w-100 fw-bold rounded-pill settle-group-btn" data-group-id="${group.id}">
                                    <i class="fa-solid fa-handshake me-2"></i> Reconcile Debts
                                </button>
                            </div>
                        </div>
                    `;
                }
            } catch (error) { 
                console.error(error); 
                groupsContainer.innerHTML = `<div class="col-12 text-center text-danger mt-5 fw-bold"><i class="fa-solid fa-triangle-exclamation me-2"></i>${error.message}</div>`;
            }
        };
        fetchMyGroups();
    }

    // --- 8. SETTLEMENT ENGINE & PROOF UPLOAD ---
    let activeSettlementGroupId = null;
    document.addEventListener('click', async (e) => {
        const settleBtn = e.target.closest('.settle-group-btn');
        if (settleBtn) {
            activeSettlementGroupId = settleBtn.dataset.groupId;
            const settleModal = new bootstrap.Modal(document.getElementById('settleDebtModal'));
            settleModal.show();
            
            const recipientSelect = document.getElementById('settleRecipient');
            recipientSelect.innerHTML = '<option value="">Analyzing your debts...</option>';
            const statusAlert = document.getElementById('settlementStatusAlert');
            if(statusAlert) statusAlert.classList.remove('d-none');
            
            try {
                const response = await fetch(`/api/groups/${activeSettlementGroupId}/balances`, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await response.json();
                
                if (response.ok) {
                    recipientSelect.innerHTML = '<option value="">Select someone you owe...</option>';
                    let hasDebts = false;
                    for (const [userId, amount] of Object.entries(data.balances)) {
                        if (amount < 0) { 
                            hasDebts = true;
                            recipientSelect.innerHTML += `<option value="${userId}">${userId.substring(0,8)} (You owe: ₹${Math.abs(amount).toFixed(2)})</option>`;
                        }
                    }
                    if (!hasDebts) {
                        recipientSelect.innerHTML = '<option value="">You are fully settled! No debts to pay.</option>';
                        document.getElementById('settleRecipient').disabled = true;
                        document.getElementById('settleSubmitBtn').disabled = true;
                    } else {
                        document.getElementById('settleRecipient').disabled = false;
                        document.getElementById('settleSubmitBtn').disabled = false;
                    }
                    if(statusAlert) statusAlert.classList.add('d-none');
                }
            } catch (error) { console.error("Balance fetch error"); }
        }
    });

    const settlementForm = document.getElementById('settlementForm');
    if (settlementForm) {
        settlementForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('settleSubmitBtn');
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Uploading Proof...';
            submitBtn.disabled = true;

            const formData = new FormData();
            formData.append('recipient', document.getElementById('settleRecipient').value);
            formData.append('amount', document.getElementById('settleAmount').value);
            
            // ---> NEW: Append the active group ID so the backend knows which squad to settle!
            formData.append('group_id', activeSettlementGroupId); 
            
            const proofFile = document.getElementById('settleProofImage').files[0];
            if(proofFile) formData.append('proof_image', proofFile);

            try {
                const response = await fetch('/api/settlements/add', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }, 
                    body: formData
                });
                if (response.ok) {
                    alert("Payment submitted! Waiting for the recipient to verify and approve.");
                    window.location.reload(); 
                } else { throw new Error('Settlement upload failed.'); }
            } catch (error) { alert(error.message); submitBtn.disabled = false; submitBtn.innerHTML = 'Confirm Transfer'; }
        });
    }

    // --- 9. LIVE POLLING & NOTIFICATIONS (SAFE GENTLE POLLING) ---
    const pendingPanel = document.getElementById('pendingApprovalsPanel');
    const approvalsListContainer = document.getElementById('approvalsListContainer');
    let knownPendingIds = new Set();
    let pollInterval = 15000; // 15 safe seconds

    const loadPendingApprovals = async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/settlements/pending-approvals', { headers: { 'Authorization': `Bearer ${token}` } });
            
            if (res.status === 429) throw new Error("Rate Limit Hit");
            
            const data = await res.json();
            pollInterval = 15000; // Reset to 15s if server is happy
            
            if (res.ok && data.pending) {
                if (pendingPanel) {
                    if (data.pending.length > 0) {
                        pendingPanel.classList.remove('d-none');
                        const countEl = document.getElementById('pendingApprovalsCount');
                        if(countEl) countEl.textContent = `You have ${data.pending.length} pending transfers to verify.`;
                        
                        if (approvalsListContainer) {
                            approvalsListContainer.innerHTML = '';
                            data.pending.forEach(item => {
                                approvalsListContainer.innerHTML += `
                                    <div class="bg-white border rounded-4 p-3 shadow-sm mb-2">
                                        <div class="d-flex justify-content-between align-items-center mb-2">
                                            <div class="small fw-bold text-dark">From: ${item.paid_by.substring(0,8)}</div>
                                            <div class="fw-bolder text-success fs-5">₹${parseFloat(item.amount).toFixed(2)}</div>
                                        </div>
                                        <div class="d-flex justify-content-between align-items-center mt-3">
                                            ${item.proof_url ? `<a href="${item.proof_url}" target="_blank" class="small btn btn-light text-primary fw-bold py-1 px-2 border"><i class="fa-solid fa-eye me-1"></i>Proof</a>` : '<span class="small text-muted">No proof</span>'}
                                            <button class="btn btn-success fw-bold approve-btn px-4 shadow-sm hover-lift" data-id="${item.id}">
                                                <i class="fa-solid fa-check me-1"></i> Approve
                                            </button>
                                        </div>
                                    </div>
                                `;
                            });
                        }
                    } else {
                        pendingPanel.classList.add('d-none');
                    }
                }

                let notifiedIds = JSON.parse(localStorage.getItem('notified_settlements') || '[]');
                let newNotifiedIds = [...notifiedIds];

                data.pending.forEach(item => {
                    if (!notifiedIds.includes(item.id)) {
                        const toastEl = document.getElementById('settlementNotificationToast');
                        const toastBody = document.getElementById('settlementToastBody');
                        
                        if (toastEl && toastBody) {
                            toastBody.innerHTML = `
                                <div class="mb-2 text-dark"><strong class="text-primary">${item.paid_by.substring(0,8)}</strong> just sent you <strong class="text-success fs-5">₹${parseFloat(item.amount).toFixed(2)}</strong>.</div>
                                <div class="d-flex gap-2 mt-3 pt-2 border-top">
                                    ${item.proof_url ? `<a href="${item.proof_url}" target="_blank" class="btn btn-sm btn-outline-secondary fw-bold w-50">View Proof</a>` : ''}
                                    <button class="btn btn-sm btn-success fw-bold w-50 approve-btn" data-id="${item.id}">Approve Now</button>
                                </div>
                            `;
                            const toast = new bootstrap.Toast(toastEl, { autohide: false }); 
                            toast.show();
                            newNotifiedIds.push(item.id);
                        }
                    }
                });
                localStorage.setItem('notified_settlements', JSON.stringify(newNotifiedIds));
            }
        } catch (err) { 
            console.error("Server backing off...", err); 
            pollInterval = 30000; // Slow down to 30s if banned
        }
    };

    // The Safe Loop - NO SETINTERVAL ALLOWED HERE
    const startGentlePolling = async () => {
        await loadPendingApprovals();
        setTimeout(startGentlePolling, pollInterval);
    };
    startGentlePolling();

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.approve-btn');
        if (btn) {
            const id = btn.dataset.id;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            btn.disabled = true;

            try {
                const res = await fetch(`/api/settlements/approve/${id}`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }});
                if (res.ok) { 
                    localStorage.removeItem('notified_settlements');
                    alert("Payment Verified! Your balances have been updated.");
                    window.location.href = '/'; 
                } else { throw new Error('Failed to approve transaction.'); }
            } catch(err) { 
                alert(err.message); 
                btn.disabled = false; 
                btn.innerHTML = originalHtml;
            }
        }
    });

    // --- 10. CREATE SQUAD / GROUP LOGIC ---
    const createGroupForm = document.getElementById('createGroupForm');
    if (createGroupForm) {
        createGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = createGroupForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating...';
            submitBtn.disabled = true;

            try {
                const response = await fetch('/api/groups/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ 
                        name: document.getElementById('groupName').value, 
                        members: document.getElementById('groupMembers').value 
                    })
                });
                
                const data = await response.json(); 
                
                if (response.ok) {
                    window.location.reload(); 
                } else {
                    alert(data.error || "Failed to provision squad."); 
                }
            } catch (error) {
                alert("Connection error.");
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // --- 11. AI RECEIPT SCANNER ---
    const scanReceiptBtn = document.getElementById('scanReceiptBtn');
    const receiptUpload = document.getElementById('receiptUpload');
    if (scanReceiptBtn && receiptUpload) {
        scanReceiptBtn.addEventListener('click', () => receiptUpload.click());
        receiptUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const originalHtml = scanReceiptBtn.innerHTML;
            scanReceiptBtn.innerHTML = '<i class="fa-solid fa-expand fa-fade me-2"></i> Analyzing...';
            scanReceiptBtn.disabled = true;
            
            const formData = new FormData();
            formData.append('receipt', file);
            try {
                const response = await fetch('/api/ai/scan-receipt', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
                const result = await response.json();
                if (response.ok) {
                    new bootstrap.Modal(document.getElementById('addExpenseModal')).show();
                    document.getElementById('expTitle').value = result.data.title;
                    document.getElementById('expAmount').value = result.data.amount;
                } else {
                    alert('AI Scan failed: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                alert('Network error during scanning.');
            } finally { 
                scanReceiptBtn.innerHTML = originalHtml;
                scanReceiptBtn.disabled = false; 
                receiptUpload.value = ''; 
            }
        });
    }

    // --- 12. AI FLOWBOT CHAT ---
    const flowbotToggle = document.getElementById('flowbot-toggle');
    const flowbotWindow = document.getElementById('flowbot-window');
    const flowbotClose = document.getElementById('flowbot-close');

    if (flowbotToggle && flowbotWindow && flowbotClose) {
        flowbotToggle.addEventListener('click', () => {
            flowbotWindow.classList.remove('d-none');
            flowbotWindow.classList.add('d-flex');
            flowbotToggle.classList.add('d-none');
        });

        flowbotClose.addEventListener('click', () => {
            flowbotWindow.classList.add('d-none');
            flowbotWindow.classList.remove('d-flex');
            flowbotToggle.classList.remove('d-none');
        });
    }

    const flowbotForm = document.getElementById('flowbot-form');
    const flowbotInput = document.getElementById('flowbot-input');
    const flowbotMessages = document.getElementById('flowbot-messages');

    if (flowbotForm && flowbotInput && flowbotMessages) {
        flowbotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const messageText = flowbotInput.value.trim();
            if (!messageText) return;

            flowbotMessages.innerHTML += `
                <div class="d-flex mb-3 align-items-start justify-content-end gap-2">
                    <div class="bg-primary text-white p-3 shadow-sm" style="border-radius: 12px; border-bottom-right-radius: 0; max-width: 85%;">
                        ${escapeHtml(messageText)}
                    </div>
                </div>
            `;
            
            flowbotInput.value = '';
            flowbotMessages.scrollTop = flowbotMessages.scrollHeight;

            const loadingIndicatorId = 'bot-loading-' + Date.now();
            flowbotMessages.innerHTML += `
                <div class="d-flex mb-3 align-items-start gap-2" id="${loadingIndicatorId}">
                    <div class="bg-light border rounded-circle d-flex align-items-center justify-content-center p-2" style="width: 32px; height: 32px;">
                        <i class="fa-solid fa-robot text-primary small"></i>
                    </div>
                    <div class="bg-white border text-muted p-3 shadow-sm" style="border-radius: 12px; border-bottom-left-radius: 0;">
                        <i class="fa-solid fa-ellipsis fa-fade"></i> AI is processing...
                    </div>
                </div>
            `;
            flowbotMessages.scrollTop = flowbotMessages.scrollHeight;

            try {
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ message: messageText })
                });

                const loaderNode = document.getElementById(loadingIndicatorId);
                if (loaderNode) loaderNode.remove();

                if (response.ok) {
                    const data = await response.json();
                    const systemReply = data.reply || "No response string resolved.";
                    
                    flowbotMessages.innerHTML += `
                        <div class="d-flex mb-3 align-items-start gap-2">
                            <div class="bg-light border rounded-circle d-flex align-items-center justify-content-center p-2" style="width: 32px; height: 32px;">
                                <i class="fa-solid fa-robot text-primary small"></i>
                            </div>
                            <div class="bg-white border text-dark p-3 shadow-sm" style="border-radius: 12px; border-bottom-left-radius: 0; max-width: 85%;">
                                ${formatBotResponse(systemReply)}
                            </div>
                        </div>
                    `;
                } else {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || "Server processing failure");
                }
            } catch (error) {
                const loaderNode = document.getElementById(loadingIndicatorId);
                if (loaderNode) loaderNode.remove();
                
                flowbotMessages.innerHTML += `
                    <div class="d-flex mb-3 align-items-start gap-2">
                        <div class="bg-danger bg-opacity-10 text-danger rounded-3 p-3 small w-100 border border-danger border-opacity-25">
                            <i class="fa-solid fa-triangle-exclamation me-1"></i> System error. Check AI API credentials.
                        </div>
                    </div>
                `;
            }
            flowbotMessages.scrollTop = flowbotMessages.scrollHeight;
        });
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function formatBotResponse(text) {
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
});