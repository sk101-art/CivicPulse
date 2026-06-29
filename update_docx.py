import zipfile
import os
import shutil
from xml.etree import ElementTree as ET

# Paths
docx_path = r'c:\Users\sujay\Downloads\miniproject\Project_Report_24CSE48.docx'
unpacked_path = r'c:\Users\sujay\Downloads\miniproject\docx_unpacked'
doc_xml_path = os.path.join(unpacked_path, 'word', 'document.xml')
output_path = r'c:\Users\sujay\Downloads\miniproject\Project_Report_24CSE48_UPDATED.docx'

# Register namespaces
namespaces = {
    'wpc': 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
    'mo': 'http://schemas.microsoft.com/office/mac/office/2008/main',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'mv': 'urn:schemas-microsoft-com:mac:vml',
    'o': 'urn:schemas-microsoft-com:office:office',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    'v': 'urn:schemas-microsoft-com:vml',
    'wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'w10': 'urn:schemas-microsoft-com:office:word',
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
    'wpi': 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk',
    'wne': 'http://schemas.microsoft.com/office/word/2006/wordml',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'
}

for prefix, uri in namespaces.items():
    ET.register_namespace(prefix, uri)

# Parse XML
tree = ET.parse(doc_xml_path)
root = tree.getroot()

# Find all body paragraphs
body = root.find('w:body', namespaces)
paragraphs = body.findall('w:p', namespaces)

# Find start: "2.1 INTRODUCTION TO PYTHON"
start_idx = None
for i, para in enumerate(paragraphs):
    texts = para.findall('.//w:t', namespaces)
    full_text = ''.join([t.text for t in texts if t.text])
    if '2.1 INTRODUCTION TO PYTHON' in full_text:
        start_idx = i
        print(f"Found start at index {i}: {full_text[:60]}")
        break

# Find end: next page break after "CHAPTER 3"
end_idx = None
if start_idx:
    for i in range(start_idx, len(paragraphs)):
        texts = paragraphs[i].findall('.//w:t', namespaces)
        full_text = ''.join([t.text for t in texts if t.text])
        page_breaks = paragraphs[i].findall('.//w:br', namespaces)
        
        if 'CHAPTER 3' in full_text:
            # Find page break after this
            for j in range(i, min(i+5, len(paragraphs))):
                br = paragraphs[j].findall('.//w:br', namespaces)
                for b in br:
                    if b.get('{urn:schemas-microsoft-com:office:word}type') == 'page':
                        end_idx = j + 1
                        print(f"Found end at index {end_idx}")
                        break
            break

if start_idx and end_idx:
    print(f"Replacing paragraphs {start_idx} to {end_idx-1}")
    print(f"Total paragraphs to replace: {end_idx - start_idx}")
else:
    print(f"Could not find boundaries. start_idx={start_idx}, end_idx={end_idx}")
