import { TrackerView } from './components/TrackerView';

/**
 * Tracker: /tracker (Kanban + table + analytics + nudges, DESIGN §10.4, USERFLOW §4).
 * `?item=<id>` opens the detail panel. dnd-kit and TanStack Table load with this route only
 * (the table view is a further lazy chunk).
 */
export function Component() {
  return (
    <div data-testid="tracker-page" className="flex min-h-0 flex-col">
      <TrackerView />
    </div>
  );
}
