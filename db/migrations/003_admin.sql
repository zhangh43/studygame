ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN group_number text CHECK (char_length(group_number) BETWEEN 1 AND 100);
ALTER TABLE users ADD COLUMN course_number text CHECK (char_length(course_number) BETWEEN 1 AND 100);
CREATE INDEX users_course_group_idx ON users(course_number, group_number);
CREATE TABLE site_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  signup_enabled boolean NOT NULL DEFAULT true
);
INSERT INTO site_settings DEFAULT VALUES;
CREATE TABLE group_evaluations (
  course_number text NOT NULL,
  group_number text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  presented boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_number, group_number)
);
-- Fail rather than silently promote an existing account named admin.
DO $$
DECLARE admin_id uuid; studio_id uuid;
BEGIN
  INSERT INTO users(email, display_name, password_hash, is_admin)
  VALUES ('admin', 'Admin', 'scrypt:929ade8a1311da38c98c749cf82744e1:98955517bbd457973ccd9818e2271642d7788649e2651b46c14a3998722e982ea8abf7e41535ae2c2062904dce4221f10f9dd0575a192e2e9cda3854d8e4e698', true)
  RETURNING id INTO admin_id;
  INSERT INTO tenants(name) VALUES ('Admin studio') RETURNING id INTO studio_id;
  INSERT INTO tenant_memberships(tenant_id, user_id, role) VALUES (studio_id, admin_id, 'owner');
END $$;
