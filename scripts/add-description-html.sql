-- Migration: Add description_html column to galleries table
-- เพิ่ม column สำหรับเก็บ rich text description (HTML)
-- รัน script นี้ใน Supabase SQL Editor

-- เพิ่ม column description_html
ALTER TABLE galleries 
ADD COLUMN IF NOT EXISTS description_html TEXT DEFAULT NULL;

-- คัดลอก description เดิมไป description_html (ถ้ายังไม่มี)
UPDATE galleries 
SET description_html = '<p>' || REPLACE(description, E'\n', '</p><p>') || '</p>'
WHERE description IS NOT NULL 
  AND description != ''
  AND description_html IS NULL;

-- Comment เพื่อให้รู้ว่า column นี้ไว้ทำอะไร
COMMENT ON COLUMN galleries.description_html IS 'Rich text description in HTML format (supports images, formatting, etc.)';
