/**
 * @file SearchOverlay.tsx
 * React component for the global search overlay.
 * 
 * This component serves as a wrapper for the NewTabSearchBar,
 * adapting it for use in the content script overlay context.
 */

import React, { useEffect, useState } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import { getBackgroundAPI } from '../../utils/comlinkSetup';
import type { BackgroundAPI } from '../../types';

interface SearchOverlayProps {
  onClose: () => void;
  selection?: string | null;
  selectionRect?: DOMRect | null;
}

// Inline fish SVG (same as the one in NewTabSearchBar) for chips
const FISH_SVG = '<svg width="16" height="16" viewBox="0 0 576 512" style="transform:scaleX(-1)"><path fill="#74d6ff" d="M180.5 141.5C219.7 108.5 272.6 80 336 80s116.3 28.5 155.5 61.5c39.1 33 66.9 72.4 81 99.8c4.7 9.2 4.7 20.1 0 29.3c-14.1 27.4-41.9 66.8-81 99.8C452.3 403.5 399.4 432 336 432s-116.3-28.5-155.5-61.5c-16.2-13.7-30.5-28.5-42.7-43.1L48.1 379.6c-12.5 7.3-28.4 5.3-38.7-4.9S-3 348.7 4.2 336.1L50 256 4.2 175.9c-7.2-12.6-5-28.4 5.3-38.6s26.1-12.2 38.7-4.9l89.7 52.3c12.2-14.6 26.5-29.4 42.7-43.1zM448 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>';

/**
 * SearchOverlay component that adapts the NewTabSearchBar for use in the
 * global search overlay context.
 */
export default function SearchOverlay({ onClose, selection, selectionRect }: SearchOverlayProps) {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  
  const noteMode = !!selection;
  const defaultValue = ''; // input starts blank in note mode

  const handleSubmitNote = async (noteText: string) => {
    try {
      const api = await getBackgroundAPI<BackgroundAPI>();
      const url = window.location.href;
      const title = document.title || url;
      const timestamp = Date.now();

      // Ensure page exists and get pageId
      const pageId: string = await api.navigation.createOrGetPage(url, title, timestamp);

      // Ensure events API has trackNote (runtime)
      const annotationId = `anno_${Date.now().toString(36)}`;

      // ---- wrap selection in anchor span ----
      let cssPath = '';
      if (selection && window.getSelection) {
        const selObj = window.getSelection();
        if (selObj && selObj.rangeCount > 0) {
          const range = selObj.getRangeAt(0);
          const anchorSpan = document.createElement('span');
          anchorSpan.dataset.doryId = annotationId;
          anchorSpan.className = 'dory-anchor';
          range.surroundContents(anchorSpan);
          cssPath = `[data-dory-id="${annotationId}"]`;
        }
      }

      // @ts-ignore – trackNote is added dynamically
      await api.events.trackNote(pageId, url, selection || '', noteText, annotationId, cssPath);

      // Inject chip beside selection immediately
      if (selectionRect) {
        const chipEl = document.createElement('div');
        chipEl.innerHTML = FISH_SVG;
        chipEl.title = noteText;
        chipEl.style.position = 'fixed';
        chipEl.style.left = `${selectionRect.right + 6}px`;
        chipEl.style.top = `${selectionRect.top + window.scrollY}px`;
        chipEl.style.background = 'transparent';
        chipEl.style.padding = '0';
        chipEl.style.border = 'none';
        chipEl.style.width = '16px';
        chipEl.style.height = '16px';
        chipEl.style.display = 'flex';
        chipEl.style.alignItems = 'center';
        chipEl.style.justifyContent = 'center';
        chipEl.style.zIndex = '999999';
        chipEl.style.cursor = 'pointer';
        chipEl.id = annotationId;
        document.body.appendChild(chipEl);
        attachTooltip(chipEl, noteText);
      }

      // push new note into state for immediate feedback
      setNotes(prev => [{
        eventId: Date.now(), // temp id
        data: { noteText, selectionText: selection || '', cssPath },
        timestamp: Date.now()
      }, ...prev]);

      // Optionally flash feedback
      console.log('[SearchOverlay] Note saved');
    } catch (err) {
      console.error('[SearchOverlay] Failed to save note:', err);
    }
  };

  // Fetch existing notes on mount
  useEffect(() => {
    (async () => {
      try {
        const api = await getBackgroundAPI<BackgroundAPI>();
        const url = window.location.href;
        const title = document.title || url;
        const pageId: string = await api.navigation.createOrGetPage(url, title, Date.now());

        // @ts-ignore
        const fetched = await api.events.getNotesForPage(pageId, 50);
        setNotes(fetched);

        // Inject chips next to anchors for existing notes
        fetched.forEach((n: any) => {
          const sel = document.querySelector(n.data?.cssPath || '');
          if (sel) {
            const rect = (sel as HTMLElement).getBoundingClientRect();
            const chipEl = document.createElement('div');
            chipEl.innerHTML = FISH_SVG;
            chipEl.title = n.data?.noteText || '';
            chipEl.style.position = 'fixed';
            chipEl.style.left = `${rect.right + 6}px`;
            chipEl.style.top = `${rect.top + window.scrollY}px`;
            chipEl.style.background = 'transparent';
            chipEl.style.padding = '0';
            chipEl.style.border = 'none';
            chipEl.style.width = '16px';
            chipEl.style.height = '16px';
            chipEl.style.display = 'flex';
            chipEl.style.alignItems = 'center';
            chipEl.style.justifyContent = 'center';
            chipEl.style.zIndex = '999999';
            chipEl.style.cursor = 'pointer';
            chipEl.id = n.data?.annotationId || `anno_${Math.random()}`;
            document.body.appendChild(chipEl);
            attachTooltip(chipEl, n.data?.noteText || '');
          }
        });
      } catch (err) {
        console.warn('[SearchOverlay] Failed to fetch notes:', err);
      } finally {
        setLoadingNotes(false);
      }
    })();
  }, []);

  // Add keyboard listener for ESC to close
  useEffect(() => {
    console.log('[DORY] SearchOverlay component mounted');
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div>
      <NewTabSearchBar
        onSearchStateChange={setIsSearchActive}
        defaultValue={defaultValue}
        onSubmitNote={handleSubmitNote}
        noteMode={noteMode}
      />

      {/* Notes chips */}
      {!loadingNotes && notes.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {notes.map((n, idx) => (
            <NoteChip key={idx} note={n} />
          ))}
        </div>
      )}
    </div>
  );
}

/* Simple chip component */
const NoteChip: React.FC<{ note: any }> = ({ note }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        cursor: 'pointer',
        padding: '6px 10px',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        background: 'var(--item-hover-bg)',
        maxWidth: expanded ? 300 : 80,
        whiteSpace: expanded ? 'normal' : 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'all 0.2s ease',
        fontSize: 12,
      }}
    >
      {note.data?.noteText || ''}
    </div>
  );
};

const ensureTooltipStyles = () => {
  if (document.getElementById('dory-inline-tooltip-style')) return;
  const style = document.createElement('style');
  style.id = 'dory-inline-tooltip-style';
  style.textContent = `
    .dory-inline-tooltip{position:fixed;background:#000;color:#fff;border:1px solid rgba(255,255,255,0.3);backdrop-filter:blur(6px);padding:4px 6px;border-radius:4px;font-size:12px;line-height:1.2;z-index:1000000;max-width:240px;pointer-events:none;white-space:normal;box-shadow:0 2px 4px rgba(0,0,0,.2);} 
    html.dark-mode .dory-inline-tooltip{background:#fff;color:#000;border:1px solid rgba(0,0,0,0.3);} 
  `;
  document.head.appendChild(style);
};

const attachTooltip = (chipEl: HTMLElement, noteText: string) => {
  ensureTooltipStyles();
  let tooltip: HTMLDivElement | null = null;
  const show = () => {
    if (tooltip) return;
    const rect = chipEl.getBoundingClientRect();
    tooltip = document.createElement('div');
    tooltip.className = 'dory-inline-tooltip';
    tooltip.textContent = noteText;
    tooltip.style.left = `${rect.right + 6}px`;
    tooltip.style.top = `${rect.top + window.scrollY}px`;
    document.body.appendChild(tooltip);
  };
  const hide = () => {
    if (tooltip) { tooltip.remove(); tooltip = null; }
  };
  chipEl.addEventListener('mouseenter', show);
  chipEl.addEventListener('mouseleave', hide);
}; 