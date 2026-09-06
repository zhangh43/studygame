CREATE TABLE IF NOT EXISTS game_stars (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id)
);

CREATE INDEX IF NOT EXISTS game_stars_user_idx
  ON game_stars(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS game_comments (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_comments_game_idx
  ON game_comments(game_id, created_at DESC, id DESC);
