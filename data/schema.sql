-- =====================================================================
-- MONDIAL 2026 — Database schema for Match Schedule + Israel TV Broadcast
-- Compatible with PostgreSQL / Supabase. Sample tables follow the
-- requirements: broadcasts, tv_channels, match_schedules, reminders,
-- user_favorites, broadcast_overrides.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tv_channels (
  id              TEXT PRIMARY KEY,                -- 'KAN11','SPORT5','SPORT1','SPORT2','SPORT5PLUS','SPORT5LIVE','KANSPORT'
  name            TEXT NOT NULL,                   -- 'כאן 11'
  type            TEXT NOT NULL,                   -- 'פתוח' | 'כבלים/לוויין' | 'סטרימינג'
  logo_emoji      TEXT,
  brand_color     TEXT,
  url             TEXT,
  is_digital      BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  code            TEXT PRIMARY KEY,
  name_he         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  flag_emoji      TEXT,
  group_letter    TEXT,
  is_host         BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS venues (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  city            TEXT,
  country         TEXT,
  flag_emoji      TEXT,
  capacity        INTEGER
);

CREATE TABLE IF NOT EXISTS match_schedules (
  id              TEXT PRIMARY KEY,                -- 'M001'..'M104'
  utc_kickoff     TIMESTAMPTZ NOT NULL,
  stage           TEXT NOT NULL,                   -- GROUP,R32,R16,QF,SF,THIRD,FINAL
  group_letter    TEXT,
  home_code       TEXT,                            -- nullable for KO placeholders
  away_code       TEXT,
  home_placeholder TEXT,                           -- e.g. '1A','W R16-1'
  away_placeholder TEXT,
  venue_id        TEXT REFERENCES venues(id),
  status          TEXT NOT NULL DEFAULT 'scheduled', -- scheduled,pregame,live,finished,postponed,cancelled
  pre_game_minutes INTEGER DEFAULT 30,
  studio_show     TEXT,
  odds_home       NUMERIC(4,2),
  odds_draw       NUMERIC(4,2),
  odds_away       NUMERIC(4,2),
  ai_insight      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_kickoff ON match_schedules(utc_kickoff);
CREATE INDEX IF NOT EXISTS idx_match_stage   ON match_schedules(stage);
CREATE INDEX IF NOT EXISTS idx_match_group   ON match_schedules(group_letter);

CREATE TABLE IF NOT EXISTS broadcasts (
  id              SERIAL PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES match_schedules(id) ON DELETE CASCADE,
  channel_id      TEXT NOT NULL REFERENCES tv_channels(id) ON DELETE CASCADE,
  is_live_feed    BOOLEAN DEFAULT TRUE,
  starts_at_utc   TIMESTAMPTZ NOT NULL,
  pre_game_starts TIMESTAMPTZ,
  studio_show     TEXT,
  notes           TEXT,
  UNIQUE (match_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_match ON broadcasts(match_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_ch    ON broadcasts(channel_id);

CREATE TABLE IF NOT EXISTS broadcast_overrides (
  match_id        TEXT PRIMARY KEY REFERENCES match_schedules(id) ON DELETE CASCADE,
  override_utc    TIMESTAMPTZ,
  override_channels JSONB,                          -- ['SPORT5','KAN11']
  override_studio TEXT,
  override_status TEXT,
  reason          TEXT,
  set_by_user_id  TEXT,
  set_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id         TEXT NOT NULL,
  team_code       TEXT NOT NULL REFERENCES teams(code) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, team_code)
);

CREATE TABLE IF NOT EXISTS reminders (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  match_id        TEXT NOT NULL REFERENCES match_schedules(id) ON DELETE CASCADE,
  remind_kind     TEXT NOT NULL,                    -- 'h60','m15','bets_close'
  delivered_at    TIMESTAMPTZ,
  UNIQUE (user_id, match_id, remind_kind)
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);

-- =====================================================================
-- Sample seeds (Israeli channels)
-- =====================================================================
INSERT INTO tv_channels (id, name, type, logo_emoji, brand_color, url) VALUES
 ('KAN11',      'כאן 11',      'פתוח',          '📺','#0a4d8c','https://www.kan.org.il/live/tv.aspx?stationId=2'),
 ('SPORT5',     'ספורט 5',    'כבלים/לוויין',  '⚽','#e30613','https://www.sport5.co.il/live'),
 ('SPORT1',     'ספורט 1',    'כבלים/לוויין',  '🏆','#1e3a8a','https://www.sport1.co.il/live'),
 ('SPORT2',     'ספורט 2',    'כבלים/לוויין',  '🥇','#0891b2','https://www.sport1.co.il/live'),
 ('SPORT5PLUS', 'ספורט 5+',   'כבלים/לוויין',  '✨','#dc2626','https://www.sport5.co.il/live'),
 ('SPORT5LIVE', 'Sport 5 Live','סטרימינג',      '🌐','#7c2d12','https://www.sport5.co.il/live'),
 ('KANSPORT',   'כאן ספורט',  'סטרימינג',      '🎥','#0a4d8c','https://www.kan.org.il/sport/')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- Views: convenient queries
-- =====================================================================
CREATE OR REPLACE VIEW v_upcoming_matches AS
SELECT m.*, v.name AS venue_name, v.city, v.country
FROM   match_schedules m
LEFT   JOIN venues v ON v.id = m.venue_id
WHERE  m.utc_kickoff > NOW()
ORDER  BY m.utc_kickoff;

CREATE OR REPLACE VIEW v_live_matches AS
SELECT *
FROM   match_schedules
WHERE  status = 'live'
   OR  (utc_kickoff <= NOW() AND utc_kickoff + INTERVAL '120 minutes' >= NOW());

CREATE OR REPLACE VIEW v_match_broadcasts_il AS
SELECT
  m.id          AS match_id,
  m.utc_kickoff,
  c.id          AS channel_id,
  c.name        AS channel_name,
  c.type        AS channel_type,
  b.is_live_feed,
  b.starts_at_utc,
  b.pre_game_starts,
  b.studio_show
FROM   match_schedules m
JOIN   broadcasts b ON b.match_id = m.id
JOIN   tv_channels c ON c.id = b.channel_id
ORDER  BY m.utc_kickoff;
