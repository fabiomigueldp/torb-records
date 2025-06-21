// frontend/src/pages/UploadPage.tsx
import React, { useCallback, useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useDropzone } from 'react-dropzone';
import axios, { AxiosProgressEvent } from 'axios';
import { useNavigate } from 'react-router-dom';

interface IFormInput {
  title: string;
  trackFile: File | null;
  coverFile: File | null;
}

// Basic Toast component (can be replaced with a library like react-toastify)
const Toast: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => (
  <div className={`fixed top-5 right-5 p-4 rounded-md shadow-lg text-white ${type === 'success' ? 'bg-success' : 'bg-error'}`}>
    <span>{message}</span>
    <button onClick={onClose} className="ml-4 font-bold">X</button>
  </div>
);


const UploadPage: React.FC = () => {
  const { control, handleSubmit, formState: { errors, isValid }, setValue, watch, reset } = useForm<IFormInput>({
    defaultValues: {
      title: '',
      trackFile: null,
      coverFile: null,
    },
    mode: 'onChange', // Validate on change to enable/disable submit button
  });
  const navigate = useNavigate();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const trackFile = watch('trackFile');
  const coverFile = watch('coverFile');

  const onDropTrack = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setValue('trackFile', acceptedFiles[0], { shouldValidate: true });
    }
  }, [setValue]);

  const { getRootProps: getTrackRootProps, getInputProps: getTrackInputProps, isDragActive: isTrackDragActive } = useDropzone({
    onDrop: onDropTrack,
    accept: { 'audio/*': ['.mp3', '.wav', '.ogg', '.flac'] },
    maxSize: 30 * 1024 * 1024, // 30MB
    multiple: false,
    onDropRejected: (fileRejections) => {
      if (fileRejections.length > 0 && fileRejections[0].errors.length > 0) {
        setStatusMessage(`Track file error: ${fileRejections[0].errors[0].message}`);
      }
    }
  });

  const pollUploadStatus = async (uploadId: string, newTrackId: number) => {
    setStatusMessage('Upload complete. Processing track...');
    try {
      const interval = setInterval(async () => {
        const response = await axios.get(`/api/upload/status/${uploadId}`);
        if (response.data.status === 'ready') {
          clearInterval(interval);
          setIsUploading(false);
          setToast({ message: 'Track available!', type: 'success' });
          setStatusMessage('Track processed and available.');
          reset(); // Reset form
          // Redirect to library, passing new track ID to highlight
          setTimeout(() => navigate(`/library?newTrackId=${newTrackId}`), 2000);
        } else if (response.data.status === 'error') {
          clearInterval(interval);
          setIsUploading(false);
          setStatusMessage(`Error processing track: ${response.data.error || 'Unknown error'}`);
          setToast({ message: 'Processing failed.', type: 'error' });
        } else {
          setStatusMessage(`Processing... Status: ${response.data.status}`);
        }
      }, 3000); // Poll every 3 seconds
    } catch (error) {
      setIsUploading(false);
      setStatusMessage('Error polling upload status.');
      setToast({ message: 'Error checking status.', type: 'error' });
      console.error('Polling error:', error);
    }
  };


  const onSubmit = async (data: IFormInput) => {
    if (!data.trackFile || !data.coverFile || !data.title) {
      setStatusMessage("All fields are required.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setStatusMessage('Uploading track and cover...');
    setToast(null);

    const formData = new FormData();
    formData.append('title', data.title);
    formData.append('track_file', data.trackFile);
    formData.append('cover_art_file', data.coverFile);

    try {
      const response = await axios.post('/api/upload/track', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(percentCompleted);
        },
      });

      if (response.status === 201 && response.data.upload_id && response.data.track_id) {
        // AC-2 Visual progress bar increments smoothly (covered by onUploadProgress)
        // Start polling for status
        pollUploadStatus(response.data.upload_id, response.data.track_id);
      } else {
        throw new Error(response.data.detail || 'Upload failed with no specific error from server.');
      }
    } catch (error: any) {
      setIsUploading(false);
      setUploadProgress(0);
      const errorMessage = error.response?.data?.detail || error.message || 'An unknown error occurred during upload.';
      setStatusMessage(`Upload Error: ${errorMessage}`);
      setToast({ message: 'Upload failed.', type: 'error' });
      console.error('Upload error:', error);
    }
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000); // Auto-hide toast after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <div className="container mx-auto p-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <h1 className="text-3xl font-bold mb-6 text-center">Upload New Track</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl mx-auto bg-base-200 shadow-xl rounded-lg p-6 space-y-6">
        <div>
          <label htmlFor="title" className="label">
            <span className="label-text text-lg">Track Title</span>
          </label>
          <Controller
            name="title"
            control={control}
            rules={{ required: 'Title is required' }}
            render={({ field }) => (
              <input
                {...field}
                type="text"
                id="title"
                placeholder="Enter track title"
                className={`input input-bordered w-full ${errors.title ? 'input-error' : ''}`}
              />
            )}
          />
          {errors.title && <p className="text-error text-sm mt-1">{errors.title.message}</p>}
        </div>

        <div>
          <label className="label">
            <span className="label-text text-lg">Track File (MP3, WAV, OGG, FLAC - Max 30MB)</span>
          </label>
          <div
            {...getTrackRootProps()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer
                        ${isTrackDragActive ? 'border-primary' : 'border-base-content/30'}
                        ${errors.trackFile ? 'border-error' : ''}
                        hover:border-primary-focus transition-colors`}
          >
            <input {...getTrackInputProps()} />
            {trackFile ? (
              <p className="text-success">{trackFile.name} ({(trackFile.size / 1024 / 1024).toFixed(2)} MB)</p>
            ) : isTrackDragActive ? (
              <p>Drop the track file here ...</p>
            ) : (
              <p>Drag 'n' drop your track file here, or click to select file</p>
            )}
          </div>
          <Controller
            name="trackFile"
            control={control}
            rules={{
              required: 'Track file is required',
              validate: value => {
                if (!value) return 'Track file is required.';
                if (value.size > 30 * 1024 * 1024) return 'Track file must be less than 30MB.';
                // Additional validation for file type can be added here if needed,
                // though dropzone's accept prop handles most of it.
                return true;
              }
            }}
            render={() => null} // Input is handled by dropzone
          />
          {errors.trackFile && <p className="text-error text-sm mt-1">{errors.trackFile.message}</p>}
        </div>

        <div>
          <label htmlFor="coverFile" className="label">
            <span className="label-text text-lg">Cover Image (JPG, PNG, WEBP)</span>
          </label>
          <Controller
            name="coverFile"
            control={control}
            rules={{
              required: 'Cover image is required',
              validate: value => {
                if (!value) return 'Cover image is required';
                const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];
                return acceptedTypes.includes(value.type) || 'Invalid file type. Please use JPG, PNG, or WEBP.';
              }
            }}
            render={({ field: { onChange, value: fieldValue, ...restField } }) => ( // Renamed value to fieldValue
              <input
                {...restField}
                type="file"
                id="coverFile"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setValue('coverFile', e.target.files[0], { shouldValidate: true });
                  }
                }}
                className={`file-input file-input-bordered w-full ${errors.coverFile ? 'file-input-error' : ''}`}
              />
            )}
          />
          {coverFile && <p className="text-sm mt-1">Selected: {coverFile.name}</p>}
          {errors.coverFile && <p className="text-error text-sm mt-1">{errors.coverFile.message}</p>}
        </div>

        {isUploading && (
          <div className="space-y-1">
            <div className="w-full bg-neutral-focus rounded-full h-2.5 my-1">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-150 ease-linear"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-center text-sm">{uploadProgress}% - {statusMessage}</p>
          </div>
        )}

        {!isUploading && statusMessage && (
           <div className={`p-3 rounded-md text-center text-sm ${statusMessage.toLowerCase().includes('error') || statusMessage.toLowerCase().includes('required') || statusMessage.toLowerCase().includes('failed') ? 'bg-error text-error-content' : 'bg-info text-info-content'}`}>
            {statusMessage}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full text-lg"
          disabled={isUploading || !isValid} // AC-1: Prevent submit if form is invalid
        >
          {isUploading ? 'Uploading...' : 'Upload Track'}
        </button>
      </form>
    </div>
  );
};

export default UploadPage;
