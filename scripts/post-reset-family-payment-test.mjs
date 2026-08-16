import fs from 'node:fs';

const source = fs.readFileSync(new URL('./post-reset-family-payment-production-smoke.mjs', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes("const APPLY_TOKEN = 'POST_RESET_FAMILY_PAYMENT_ACCEPTANCE'"), 'Post-reset acceptance must require its explicit apply token.');
assert(source.includes("PROJECT_ID !== 'clasesde10-50add'"), 'Post-reset acceptance must be pinned to the production project.');
assert(source.includes("['clasesde10.com', 'clasesde10-50add.web.app']"), 'Post-reset acceptance must restrict the production host.');
assert(source.includes('resetMarkerPath') && source.includes('verificationMarkerPath') && source.includes('resetStatePath'), 'Post-reset acceptance must require all three reset evidence files.');
assert(source.includes("verificationMarker.verification?.mode, 'read_only_independent_verification'"), 'Post-reset acceptance must require the independent read-only verifier.');
assert(source.includes('paymentAccessLocked: true') && source.includes('paymentAccessDebtAmount: 25'), 'The fixture must cover the overdue access lock.');
assert(source.includes('unmarkedClassId') && source.includes("selectOption('no_realizada')"), 'The flow must mark a past class as not given before payment.');
assert(source.includes('teacherCalendarOnlyLockVerified') && source.includes('teacherAccessRestoredAfterMarking'), 'The flow must verify the five-day teacher calendar-only lock and immediate restoration.');
assert(source.includes('Family attendance was enabled before the teacher marked the class.'), 'The flow must verify that the family cannot act before the teacher.');
assert(source.includes("value = '35.00'") && source.includes("value = '59.00'") && source.includes("value = '60.00'"), 'The flow must reject partial and altered payments before accepting the exact total.');
assert(source.includes("setInputFiles({") && source.includes('proofDocumentCreated'), 'The flow must upload and verify a real payment proof.');
assert(source.includes("window.validarPago(paymentId, 'validado'") && source.includes('atomic admin payment approval'), 'The flow must approve the proof through the authenticated admin application.');
assert(source.includes('Admin CRM profile is missing') && source.includes('Hijo Aceptacion'), 'The flow must verify full family and child identity in the admin CRM.');
assert(source.includes('paymentSchedules/${fixture.scheduleId}') && source.includes("frequency: 'quincenal'") && source.includes("hasText: 'Cada 15 dias'"), 'The flow must exercise a real fortnightly family payment day.');
assert(source.includes('.admin-family-payment-event') && source.includes('Admin calendar does not state the exact overdue family debt.'), 'The flow must verify exact family debt in the authenticated admin calendar.');
assert(source.includes('.admin-teacher-payout-event') && source.includes('Admin calendar does not state the exact teacher payout.'), 'The flow must verify the exact teacher payout in the authenticated admin calendar.');
assert(source.includes('Admin debt card is missing the related child.') && source.includes('Admin debt card does not expose every related profile action.'), 'The flow must verify child identity and profile actions on admin debt alerts.');
assert(source.includes('one grouped admin family debt notice') && source.includes('Admin debt notice exposes internal codes.'), 'The flow must verify one concise, human-readable admin debt notice.');
assert(source.includes('adminDebtNoticeFullIdentityVerified') && source.includes('adminDebtNoticeResolvedAfterApproval'), 'The flow must verify notice identities and live removal after payment approval.');
assert(source.includes('liveUnlockWithoutReload') && source.includes("classList.contains('payment-paid')"), 'The flow must verify live unlock and green paid calendar state.');
assert(source.includes('preflightCleanup = await cleanupAcceptanceArtifacts(db, bucket)') && source.includes('preFixtureVerification = runIndependentVerification()'), 'A retry must remove orphan fixtures and prove a clean pre-test state.');
assert(source.includes('finally {') && source.includes('cleanupAcceptanceArtifacts(db, bucket, fixture)'), 'Fixture cleanup must run from finally.');
assert(source.includes('listAcceptanceAuthUsers') && source.includes('admin.auth().deleteUsers') && source.includes('remainingAuthUsers.length, 0'), 'Cleanup must recover and remove temporary Firebase Auth accounts from prior attempts.');
assert(source.indexOf('authUsers.forEach((user) => fixtureUids.add(user.uid))') < source.indexOf('for (const uid of fixtureUids)'), 'Auth UIDs must be recovered before proof-storage cleanup.');
assert(source.includes("identity('delete'") && source.includes('listStorageFiles(bucket, { prefix })'), 'Cleanup must remove temporary identities and proof files, including when the project has no Storage bucket.');
assert(source.includes('postCleanupVerification = runIndependentVerification()'), 'A second independent zero verification must run after cleanup.');

console.log('Post-reset family payment acceptance safety validation passed.');
