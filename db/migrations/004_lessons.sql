CREATE TABLE course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_number text NOT NULL CHECK (char_length(course_number) BETWEEN 1 AND 100),
  lesson_number integer NOT NULL CHECK (lesson_number BETWEEN 1 AND 20),
  star_group_number text CHECK (char_length(star_group_number) BETWEEN 1 AND 100),
  UNIQUE (course_number, lesson_number)
);
-- One winner column on each lesson guarantees at most one lesson-star winner.
CREATE TABLE lesson_evaluations (
  lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  group_number text NOT NULL CHECK (char_length(group_number) BETWEEN 1 AND 100),
  completed boolean NOT NULL DEFAULT false,
  presented boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, group_number)
);
-- Existing group_evaluations remain the final course evaluations.
