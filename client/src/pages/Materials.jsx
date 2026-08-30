import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { Upload, FileText, Trash2, Brain, Loader2, Plus, ChevronRight } from 'lucide-react';

export default function Materials() {
  const [materials, setMaterials] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState(null); // { title, content, filename }
  const [analyzing, setAnalyzing] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const navigate = useNavigate();

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    try {
      const data = await api.getMaterials();
      setMaterials(data);
    } catch (err) {
      console.error(err);
    }
  }

  const ACCEPTED_TYPES = ['.pdf', '.txt', '.docx', '.pptx'];
  const MAX_SIZE_MB = 10;

  function validateFile(f) {
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      return `Unsupported file type "${ext}". Please upload a PDF, DOCX, PPTX, or TXT file.`;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_SIZE_MB} MB.`;
    }
    return null;
  }

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      setError(err);
      setFile(null);
      e.target.value = '';
      return;
    }
    setError('');
    setFile(f);
  }

  // Step 1: Upload file for preview (extract content + generate title)
  async function handlePreview(e) {
    e.preventDefault();
    setError('');
    setPreviewing(true);

    try {
      if (file) {
        const err = validateFile(file);
        if (err) {
          setError(err);
          setPreviewing(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', file);
        const data = await api.previewMaterial(formData);
        setPreviewData(data);
        setTitle(data.title);
        setContent(data.content);
      } else {
        // No file — paste content directly, skip preview
        if (!title || !content) {
          setError('Title and content are required');
          setPreviewing(false);
          return;
        }
        setPreviewData({ title, content, filename: null });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPreviewing(false);
    }
  }

  // Step 2: Save the material with the (possibly edited) title
  async function handleSave() {
    setError('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);

      await api.uploadMaterial(formData);
      setTitle('');
      setContent('');
      setFile(null);
      setPreviewData(null);
      loadMaterials();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleCancelPreview() {
    setPreviewData(null);
    setTitle('');
    setContent('');
  }

  async function handleAnalyze(materialId) {
    setAnalyzing(materialId);
    try {
      const result = await api.analyzeMaterial(materialId);
      showToast(result.message);
      loadMaterials();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(null);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this material?')) return;
    try {
      await api.deleteMaterial(id);
      loadMaterials();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-primary-900 dark:text-primary-100">
          Learning Materials
        </h1>
        <p className="text-primary-500 dark:text-primary-400 mt-1 font-body">
          Upload your lecture notes, textbook chapters, or any educational content
        </p>
      </div>

      {/* Upload Form */}
      <div className="clay-card p-6 md:p-8 mb-8 animate-slide-up" style={{ animationDelay: '100ms' }}>
        <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 mb-5 flex items-center gap-2">
          <div className="bg-primary-100 dark:bg-primary-800 p-2 rounded-clay-sm">
            <Plus size={18} className="text-primary-600 dark:text-primary-400" />
          </div>
          Upload Material
        </h2>

        {error && (
          <div role="alert" aria-live="polite" className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-clay mb-5 text-sm font-semibold"
            style={{ boxShadow: '3px 3px 0 0 #FECACA' }}>
            {error}
          </div>
        )}
        {toast && (
          <div role="status" aria-live="polite" className="bg-green-50 dark:bg-green-900/30 border-2 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-clay mb-5 text-sm font-semibold"
            style={{ boxShadow: '3px 3px 0 0 #BBF7D0' }}>
            ✅ {toast}
          </div>
        )}

        {/* Step 1: File selection / paste */}
        {!previewData && (
          <form onSubmit={handlePreview} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Chapter 5 — Photosynthesis"
                className="clay-input"
                required={!file}
              />
              {file && (
                <p className="text-xs text-primary-400 dark:text-primary-500 mt-1 font-semibold">Title will be auto-generated from file content — you can edit it next.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">
                Content <span className="text-primary-400 dark:text-primary-600 font-normal">(paste text or upload file)</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste your learning material here..."
                rows={6}
                className="clay-input resize-none"
              />
              <div className="mt-3 flex items-center gap-3">
                <label className="clay-btn-outline text-sm py-2 px-4 inline-flex items-center gap-1.5">
                  <Upload size={14} />
                  {file ? file.name : 'Choose File'}
                  <input
                    type="file"
                    accept=".pdf,.txt,.docx,.pptx"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
                {file && (
                  <span className="text-xs text-primary-400 dark:text-primary-500 font-semibold">{(file.size / 1024).toFixed(0)} KB</span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={previewing || (!content && !file)}
              className="clay-btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {previewing ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
              {previewing ? 'Analyzing content…' : 'Review & Edit Title'}
            </button>
          </form>
        )}

        {/* Step 2: Edit auto-generated title before saving */}
        {previewData && (
          <div className="space-y-5">
            <div className="bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-clay text-sm font-semibold"
              style={{ boxShadow: '3px 3px 0 0 #BFDBFE' }}>
              {previewData.filename
                ? `✅ Extracted content from "${previewData.filename}" — review the title below and save.`
                : '✅ Content ready — review the title below and save.'}
            </div>

            <div>
              <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Chapter 5 — Photosynthesis"
                className="clay-input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Content Preview</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="clay-input resize-none"
                readOnly
              />
              <p className="text-xs text-primary-400 dark:text-primary-500 mt-1 font-semibold">
                {content.length.toLocaleString()} characters extracted
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={uploading || !title}
                className="clay-btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? 'Saving…' : 'Save Material'}
              </button>
              <button
                onClick={handleCancelPreview}
                className="clay-btn-outline text-sm py-2 px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Materials List */}
      <div className="space-y-3">
        {materials.length === 0 ? (
          <div className="clay-card p-12 text-center animate-fade-in">
            <div className="bg-primary-50 dark:bg-primary-800 w-20 h-20 rounded-clay-xl mx-auto mb-4 flex items-center justify-center">
              <FileText size={36} className="text-primary-300 dark:text-primary-600" />
            </div>
            <p className="text-primary-400 dark:text-primary-500 font-semibold text-lg">No materials uploaded yet</p>
            <p className="text-primary-300 dark:text-primary-600 text-sm mt-1">Upload your first material above to get started</p>
          </div>
        ) : (
          materials.map((m, i) => (
            <div
              key={m.id}
              className="clay-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-slide-up"
              style={{ animationDelay: `${(i + 2) * 60}ms` }}
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary-100 dark:bg-primary-800 p-2.5 rounded-clay border border-primary-200 dark:border-primary-700">
                  <FileText className="text-primary-500 dark:text-primary-400" size={20} />
                </div>
                <div>
                  <p className="font-display font-bold text-primary-900 dark:text-primary-100">{m.title}</p>
                  <p className="text-xs text-primary-400 dark:text-primary-500 font-semibold mt-0.5">
                    {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(m.created_at))}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleAnalyze(m.id)}
                  disabled={analyzing === m.id}
                  className="clay-btn bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 border-2 border-purple-200 dark:border-purple-800 text-sm py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
                  style={{ boxShadow: '3px 3px 0 0 #DDD6FE' }}
                >
                  {analyzing === m.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Brain size={14} />
                  )}
                  {analyzing === m.id ? 'Analyzing…' : 'AI Analyze'}
                </button>
                <button
                  onClick={() => navigate(`/learn/${m.id}`)}
                  className="clay-btn-primary text-sm py-1.5 px-3 flex items-center gap-1"
                >
                  Learn
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="p-2 rounded-clay text-primary-300 dark:text-primary-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-150"
                  title="Delete material"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
