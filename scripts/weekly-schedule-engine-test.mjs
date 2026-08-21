import assert from 'node:assert/strict';
import {
  buildWeeklyScheduleState,
  weeklyScheduleDashboardRoute,
  weeklyScheduleLabel,
} from '../js/weekly-schedule-engine.js';

const proposal = {
  id: 'p1',
  kind: 'weekly_recurring',
  status: 'propuesta',
  proposedByRole: 'familia',
  recurrence: { frequency: 'weekly', dayOfWeek: 1 },
  hora_inicio: '17:00',
  hora_fin: '18:30',
  createdAt: '2026-08-21T10:00:00.000Z',
};

assert.equal(weeklyScheduleLabel(proposal), 'Todos los martes, 17:00-18:30');
assert.equal(buildWeeklyScheduleState([], 'familia').key, 'family_must_propose');
assert.equal(buildWeeklyScheduleState([], 'profesor').key, 'waiting_family_first');
assert.equal(buildWeeklyScheduleState([], 'profesor').canOpenPlanner, false);
assert.equal(buildWeeklyScheduleState([proposal], 'profesor').key, 'pending_for_me');
assert.equal(buildWeeklyScheduleState([proposal], 'profesor').canOpenPlanner, true);
assert.equal(buildWeeklyScheduleState([proposal], 'familia').key, 'waiting_for_other');
const rejectedProposal = { ...proposal, id: 'p2', status: 'rechazada', updatedAt: '2026-08-21T11:00:00.000Z' };
assert.equal(buildWeeklyScheduleState([rejectedProposal], 'familia').key, 'proposal_needed');
assert.equal(buildWeeklyScheduleState([rejectedProposal], 'profesor').key, 'waiting_family_first');
assert.equal(buildWeeklyScheduleState([rejectedProposal], 'profesor').canOpenPlanner, false);
const acceptedProposal = { ...proposal, id: 'p3', status: 'aceptada', updatedAt: '2026-08-21T12:00:00.000Z' };
assert.equal(buildWeeklyScheduleState([acceptedProposal], 'profesor').key, 'accepted');
assert.equal(buildWeeklyScheduleState([acceptedProposal], 'profesor').canOpenPlanner, true);
assert.equal(
  weeklyScheduleDashboardRoute('familia', 'a 1', 'p/2'),
  '/pages/dashboard/familia.html?assignment=a+1&proposal=p%2F2#profesores',
);
assert.equal(
  weeklyScheduleDashboardRoute('profesor', 'a1'),
  '/pages/dashboard/profesor.html?assignment=a1#alumnos',
);

console.log('weekly-schedule-engine: ok');
