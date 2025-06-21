import subprocess
import os
from pathlib import Path

def generate_test_mp3(output_dir: Path, filename: str = "test_sine.mp3", duration_seconds: int = 2) -> Path:
    """
    Generates a test MP3 file with a sine wave using FFmpeg.

    Args:
        output_dir: The directory where the MP3 file will be saved.
        filename: The name of the output MP3 file.
        duration_seconds: The duration of the sine wave in seconds.

    Returns:
        The Path object of the generated MP3 file.

    Raises:
        RuntimeError: If FFmpeg command fails.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename

    command = [
        "ffmpeg",
        "-f", "lavfi",
        "-i", f"sine=frequency=1000:duration={duration_seconds}",
        "-y", # Overwrite output file if it exists
        str(output_path)
    ]

    try:
        process = subprocess.run(command, capture_output=True, text=True, check=True)
        print(f"FFmpeg stdout: {process.stdout}")
        if process.stderr:
            print(f"FFmpeg stderr: {process.stderr}")
    except subprocess.CalledProcessError as e:
        error_message = f"FFmpeg command failed with exit code {e.returncode}.\n"
        error_message += f"Command: {' '.join(e.cmd)}\n"
        error_message += f"Stdout: {e.stdout}\n"
        error_message += f"Stderr: {e.stderr}"
        raise RuntimeError(error_message) from e

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError(f"Generated MP3 file {output_path} not found or is empty.")

    return output_path
