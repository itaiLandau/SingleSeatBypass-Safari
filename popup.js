// Helper for coloring logs in the console panel
function appendLog(text, type = 'info') {
  const terminal = document.getElementById('terminal-logs');
  if (!terminal) return;

  const logLine = document.createElement('div');
  logLine.className = `log-line log-${type}`;

  const prefix = document.createElement('span');
  prefix.className = 'log-prefix';
  
  let prefixText = '';
  switch (type) {
    case 'info': prefixText = '⚙️ [Info] '; break;
    case 'success': prefixText = '✅ [Success] '; break;
    case 'error': prefixText = '❌ [Error] '; break;
    case 'warn': prefixText = '⚠️ [Warn] '; break;
    default: prefixText = '💡 ';
  }

  prefix.textContent = prefixText;
  logLine.appendChild(prefix);
  
  const textNode = document.createTextNode(text);
  logLine.appendChild(textNode);

  terminal.appendChild(logLine);
  terminal.scrollTop = terminal.scrollHeight;
}

// Clear Terminal logs
document.getElementById('btn-clear').addEventListener('click', () => {
  const terminal = document.getElementById('terminal-logs');
  if (terminal) {
    terminal.innerHTML = '<div class="log-line log-waiting"><span class="log-prefix">System:</span> Log cleared. Ready for injection.</div>';
  }
});

// Primary Injection Logic
document.getElementById('btn-bypass').addEventListener('click', async () => {
  appendLog('Initializing SeatBypass engine...', 'info');

  // 1. Get active tab
  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      appendLog('No active tab found. Ensure you are on a ticketing page.', 'error');
      return;
    }
    tab = tabs[0];
    appendLog(`Connected to tab: "${tab.title.substring(0, 30)}..."`, 'info');
  } catch (err) {
    appendLog(`Failed to query active tab: ${err.message}`, 'error');
    return;
  }

  // 2. Read user preferences from UI switches
  const bypassSingle = document.getElementById('bypass-single').checked;
  const bypassDouble = document.getElementById('bypass-double').checked;
  const bypassHandicap = document.getElementById('bypass-handicap').checked;

  appendLog(`Active settings: SingleSeat=${bypassSingle}, DoubleSeat=${bypassDouble}, Handicap=${bypassHandicap}`, 'info');
  appendLog('Injecting bypass script into main page context...', 'info');

  // 3. Inject script in MAIN execution world (to access Angular __ngContext__)
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN', // CRITICAL: Run in page's main context, not the isolated sandbox
      func: (config) => {
        const diagnostics = [];
        const log = (msg, success = true) => diagnostics.push({ msg, type: success ? 'success' : 'warn' });
        const logErr = (msg) => diagnostics.push({ msg, type: 'error' });
        const logInfo = (msg) => diagnostics.push({ msg, type: 'info' });

        try {
          logInfo('Bypass script running inside target page context...');
          
          let platformService = null;
          let elements = Array.from(document.querySelectorAll('*'));
          
          // Step A: Search DOM for Platform service containing parameters
          elements.forEach(el => {
            if (!el.__ngContext__) return;
            
            el.__ngContext__.forEach(item => {
              if (!item || typeof item !== 'object') return;
              
              // Direct check
              if (item.params && ('isSingleSeatAllowed' in item.params)) {
                platformService = item;
              }
              
              // Nested checks (dig one level deeper)
              Object.values(item).forEach(val => {
                if (val && typeof val === 'object' && val.params && ('isSingleSeatAllowed' in val.params)) {
                  platformService = val;
                }
              });
            });
          });

          // Step B: Inject parameter bypasses if service is found
          if (platformService) {
            log(`Found platform service parameters on page!`);
            
            if (config.bypassSingle) {
              platformService.params.isSingleSeatAllowed = true;
              log('Set "isSingleSeatAllowed" = true (Skipping single seat error)');
            }
            
            if (config.bypassDouble) {
              platformService.params.isDoubleSeatValidate = false;
              // If seatValidity or doubleSeatValidity exist directly, force them
              if ('seatValidity' in platformService.params) {
                platformService.params.seatValidity = true;
              }
              if ('doubleSeatValidity' in platformService.params) {
                platformService.params.doubleSeatValidity = true;
              }
              log('Disabled adjacent double-seat validity blocks');
            }
          } else {
            logErr('Could not find platform service in Angular context. Are you on the seat selection step?');
          }

          // Step C: Handicap validation bypass
          if (config.bypassHandicap) {
            logInfo('Scanning for handicap verification structures...');
            let handicapPatched = false;
            
            // 1. Try to find platform modals and patch openHandicapAlert
            elements.forEach(el => {
              if (!el.__ngContext__) return;
              el.__ngContext__.forEach(item => {
                if (!item || typeof item !== 'object') return;
                
                // Inspect platform modals
                if (item.platform && item.platform.modals && item.platform.modals.openHandicapAlert) {
                  const originalModal = item.platform.modals.openHandicapAlert;
                  item.platform.modals.openHandicapAlert = function() {
                    logInfo('Intercepted openHandicapAlert() - automatically approving handicap ID requirement.');
                    return {
                      result: Promise.resolve(true) // Resolve automatically to true (proceed)
                    };
                  };
                  handicapPatched = true;
                }
                
                // Inspect items directly for modals property
                if (item.modals && item.modals.openHandicapAlert) {
                  item.modals.openHandicapAlert = function() {
                    logInfo('Intercepted modals.openHandicapAlert() - automatically approving handicap ID.');
                    return {
                      result: Promise.resolve(true)
                    };
                  };
                  handicapPatched = true;
                }
              });
            });

            // 2. Try to find the seat selection service and override the handicap attribute
            elements.forEach(el => {
              if (!el.__ngContext__) return;
              el.__ngContext__.forEach(item => {
                if (item && item.onSelect && item.plan) {
                  // Intercept seat selection to automatically strip handicap requirements if present
                  const originalOnSelect = item.onSelect.bind(item);
                  item.onSelect = function(seat) {
                    if (seat && seat.venueSeatAttributeId) {
                      logInfo(`Intercepted onSelect for Seat ${seat.rowLabel}-${seat.label}. Temporarily disabling handicap check.`);
                      // Backup and strip temporarily to bypass angular check, then restore
                      const originalAttr = seat.venueSeatAttributeId;
                      seat.venueSeatAttributeId = null; 
                      originalOnSelect(seat);
                      setTimeout(() => { seat.venueSeatAttributeId = originalAttr; }, 100);
                    } else {
                      originalOnSelect(seat);
                    }
                  };
                  handicapPatched = true;
                }
              });
            });

            if (handicapPatched) {
              log('Handicap Seat Bypass patched successfully.');
            } else {
              logErr('Could not find active handicap modal services. Please select a normal seat if possible.');
            }
          }

          // Force view state refresh (Change Detection) across active elements
          elements.forEach(el => {
            if (el.__ngContext__) {
              el.__ngContext__.forEach(item => {
                if (item && typeof item === 'object') {
                  if (item.cdr && typeof item.cdr.detectChanges === 'function') {
                    try { item.cdr.detectChanges(); } catch(e) {}
                  }
                  if (item.ngOnChanges && typeof item.ngOnChanges === 'function') {
                    try { item.ngOnChanges(); } catch(e) {}
                  }
                }
              });
            }
          });
          
          logInfo('Change detection triggered. Page state is updated.');
          return { success: true, logs: diagnostics };

        } catch (e) {
          logErr(`Runtime error during injection: ${e.message}`);
          return { success: false, logs: diagnostics };
        }
      },
      args: [{ bypassSingle, bypassDouble, bypassHandicap }]
    });

    // 4. Render logs returned from the page context
    if (results && results[0] && results[0].result) {
      const response = results[0].result;
      
      // Print logs step by step
      response.logs.forEach(item => {
        appendLog(item.msg, item.type);
      });

      if (response.success) {
        appendLog('Bypass successfully applied! You can now select your seats and proceed.', 'success');
      } else {
        appendLog('Bypass completed with warnings. Check logs above.', 'warn');
      }
    } else {
      appendLog('Empty response received from injected frame.', 'warn');
    }

  } catch (err) {
    appendLog(`Injection failed: ${err.message}`, 'error');
    console.error(err);
  }
});
