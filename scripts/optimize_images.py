import os
import glob
from PIL import Image

def optimize_images():
    directories = ['assets/images', 'uploads']
    exclude_dirs = ['assets/images/favicon']
    
    max_width = 1920
    quality = 80
    
    # Store renamed files to update references
    # old_path_suffix -> new_path_suffix (e.g., '/assets/images/hero-image.jpg' -> '/assets/images/hero-image.webp')
    renames = {}
    
    for d in directories:
        if not os.path.exists(d):
            continue
            
        for root, dirs, files in os.walk(d):
            # Check exclusions
            skip = False
            for ex in exclude_dirs:
                if root.startswith(ex):
                    skip = True
                    break
            if skip:
                continue
                
            for file in files:
                filepath = os.path.join(root, file)
                ext = file.split('.')[-1].lower()
                
                if ext in ['jpg', 'jpeg', 'png', 'webp']:
                    try:
                        img = Image.open(filepath)
                        needs_save = False
                        
                        # Convert to RGB if necessary
                        if img.mode in ("RGBA", "P"):
                            if ext != 'png' and ext != 'webp': # keep alpha for png/webp
                                img = img.convert("RGB")
                                needs_save = True
                        
                        # Resize if too large
                        if img.width > max_width:
                            ratio = max_width / img.width
                            new_height = int(img.height * ratio)
                            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                            needs_save = True
                        
                        new_filename = file.rsplit('.', 1)[0] + '.webp'
                        new_filepath = os.path.join(root, new_filename)
                        
                        # If it's a new extension
                        if ext != 'webp':
                            img.save(new_filepath, 'WEBP', quality=quality)
                            os.remove(filepath)
                            
                            # Record for replacing in HTML
                            old_ref = filepath.replace('\\', '/')
                            new_ref = new_filepath.replace('\\', '/')
                            
                            # Keep only the suffix from assets or uploads
                            old_suffix = old_ref[old_ref.find(d):]
                            new_suffix = new_ref[new_ref.find(d):]
                            
                            renames['/' + old_suffix] = '/' + new_suffix
                            print(f"Converted & Resized: {filepath} -> {new_filepath}")
                            
                        # If it's already webp, maybe re-compress if large or resized
                        elif needs_save or os.path.getsize(filepath) > 300 * 1024:
                            img.save(filepath, 'WEBP', quality=quality)
                            print(f"Re-compressed/Resized: {filepath}")
                            
                    except Exception as e:
                        print(f"Error processing {filepath}: {e}")

    # Update references in HTML, MD, JS, CSS files
    if renames:
        print(f"Updating references for {len(renames)} files...")
        search_exts = ['*.html', '*.md', '*.js', '*.css', '_layouts/*.html', '_includes/**/*.html']
        files_to_check = []
        for ext in search_exts:
            files_to_check.extend(glob.glob(f"**/{ext}", recursive=True))
            
        for filepath in set(files_to_check):
            if not os.path.isfile(filepath): continue
            if 'node_modules' in filepath or '_site' in filepath or '.git' in filepath:
                continue
                
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                new_content = content
                changed = False
                for old_ref, new_ref in renames.items():
                    if old_ref in new_content:
                        new_content = new_content.replace(old_ref, new_ref)
                        changed = True
                        
                    # Also check without leading slash just in case
                    old_ref_no_slash = old_ref.lstrip('/')
                    new_ref_no_slash = new_ref.lstrip('/')
                    if old_ref_no_slash in new_content:
                        new_content = new_content.replace(old_ref_no_slash, new_ref_no_slash)
                        changed = True
                        
                if changed:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated references in: {filepath}")
            except Exception as e:
                pass # Probably not a text file
                
    print("Optimization complete.")

if __name__ == "__main__":
    optimize_images()
