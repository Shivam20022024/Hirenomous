try:
    import fitz  # PyMuPDF
except Exception:
    fitz = None

import pypdf
from docx import Document
import os

def extract_text_from_pdf(file_path: str) -> str:
    text = ""
    if fitz is not None:
        try:
            with fitz.open(file_path) as doc:
                for page in doc:
                    text += page.get_text()
            return text
        except Exception:
            pass
    
    # Fallback to pypdf
    try:
        reader = pypdf.PdfReader(file_path)
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
        return text
    except Exception as e:
        raise ValueError(f"Failed to extract PDF text: {e}")

def extract_text_from_docx(file_path: str) -> str:
    doc = Document(file_path)
    text_parts = [para.text for para in doc.paragraphs if para.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                text_parts.append(row_text)
    return "\n".join(text_parts)

def extract_text(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext == ".docx":
        return extract_text_from_docx(file_path)
    else:
        # Fallback for plain text
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except:
            raise ValueError(f"Unsupported file format: {ext}")
