-- seed_scale_readings() (#58) — correctness at a CI-cheap scale (10 meters
-- x 2 days), not the real 10M-row invocation. The set-based INSERT...SELECT
-- shape is identical at any size; this proves the shape is right without
-- making every CI run insert millions of rows.

begin;
select plan(4);

select lives_ok(
  $$ select seed_scale_readings(10, 2) $$,
  'seed_scale_readings runs without error at a small scale'
);

select ok(
  (select count(*) from meters where serial like 'LOADTEST-%') = 10,
  'creates exactly p_meter_count meters'
);

select ok(
  (select count(*) from meter_readings mr join meters m on m.id = mr.meter_id where m.serial like 'LOADTEST-%') = 10 * 2 * 24,
  'creates p_meter_count x p_days x 24 hourly readings'
);

select ok(
  (select seed_scale_readings(10, 2)) = 0,
  'the LOADTEST- guard makes a second call a no-op, not a duplicate seed'
);

select * from finish();
rollback;
