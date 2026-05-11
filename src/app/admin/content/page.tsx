'use client';

import { useEffect, useState } from 'react';
import {
  FileText, Plus, Edit3, Eye, Trash2, Globe, Lock,
  Save, X, Search, ExternalLink,
} from 'lucide-react';
import { useAdminStore } from '@/stores/admin-store';

interface ContentPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  meta_description: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export default function AdminContentPage() {
  const { admin } = useAdminStore();
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingPage, setEditingPage] = useState<ContentPage | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    meta_description: '',
    is_published: false,
  });

  const fetchContent = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/content');
      if (res.ok) {
        const data = await res.json();
        setPages(data.content || []);
      }
    } catch (error) {
      console.error('Failed to fetch content:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  const startEdit = (page: ContentPage) => {
    setEditingPage(page);
    setFormData({
      title: page.title,
      slug: page.slug,
      content: page.content,
      meta_description: page.meta_description || '',
      is_published: page.is_published,
    });
    setIsCreating(false);
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingPage(null);
    setFormData({
      title: '',
      slug: '',
      content: '',
      meta_description: '',
      is_published: false,
    });
  };

  const cancelEdit = () => {
    setEditingPage(null);
    setIsCreating(false);
    setFormData({ title: '', slug: '', content: '', meta_description: '', is_published: false });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isCreating) {
        const res = await fetch('/api/admin/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          await fetchContent();
          cancelEdit();
        }
      } else if (editingPage) {
        const res = await fetch('/api/admin/content', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingPage.id, ...formData }),
        });
        if (res.ok) {
          await fetchContent();
          cancelEdit();
        }
      }
    } catch (error) {
      console.error('Failed to save content:', error);
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (page: ContentPage) => {
    try {
      const res = await fetch('/api/admin/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: page.id, is_published: !page.is_published }),
      });
      if (res.ok) {
        await fetchContent();
      }
    } catch (error) {
      console.error('Failed to toggle publish:', error);
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60);
  };

  const filteredPages = pages.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.slug.toLowerCase().includes(search.toLowerCase())
  );

  const isSuperAdmin = admin?.role === 'super_admin';

  return (
    <div className="space-y-4">
      {/* Editor Modal */}
      {(editingPage || isCreating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#0c0d0e] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">
                {isCreating ? 'إنشاء صفحة جديدة' : `تعديل: ${editingPage?.title}`}
              </h3>
              <button onClick={cancelEdit} className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">العنوان</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        title: e.target.value,
                        slug: isCreating ? generateSlug(e.target.value) : formData.slug,
                      });
                    }}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                    placeholder="عنوان الصفحة"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">الرابط (Slug)</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 font-mono"
                    placeholder="page-slug"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-[#8a8f98] mb-1.5 block">وصف SEO</label>
                <input
                  type="text"
                  value={formData.meta_description}
                  onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                  className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                  placeholder="وصف مختصر للصفحة لمحركات البحث"
                  maxLength={160}
                />
                <p className="text-[10px] text-[#8a8f98] mt-1">{formData.meta_description.length}/160</p>
              </div>

              <div>
                <label className="text-xs text-[#8a8f98] mb-1.5 block">المحتوى</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 min-h-[300px] font-mono"
                  placeholder="اكتب محتوى الصفحة هنا... (يدعم HTML)"
                  dir="ltr"
                />
              </div>

              <label className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={formData.is_published}
                    onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-10 h-5 rounded-full transition-colors ${formData.is_published ? 'bg-[#0ecb81]' : 'bg-white/10'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${formData.is_published ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-[#f7f8f8]">نشر الصفحة</p>
                  <p className="text-[10px] text-[#8a8f98]">عند التفعيل ستكون الصفحة متاحة للجميع</p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5">
              <button
                onClick={cancelEdit}
                className="px-4 py-2 rounded-lg bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] text-sm transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.title || !formData.slug}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0052ff] hover:bg-[#0045d1] text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isCreating ? 'إنشاء' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
            <input
              type="text"
              placeholder="بحث في الصفحات..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#0c0d0e] border border-white/10 rounded-lg pr-10 pl-4 py-2 text-sm text-[#d0d6e0] placeholder-[#8a8f98] w-[260px] focus:outline-none focus:border-[#0052ff]/50"
            />
          </div>
        </div>

        {isSuperAdmin && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0052ff] hover:bg-[#0045d1] text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            صفحة جديدة
          </button>
        )}
      </div>

      {/* Content Pages List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
        </div>
      ) : filteredPages.length === 0 ? (
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-12 text-center">
          <FileText className="h-10 w-10 text-[#8a8f98] mx-auto mb-3" />
          <p className="text-sm text-[#8a8f98]">لا توجد صفحات محتوى</p>
          <p className="text-xs text-[#8a8f98] mt-1">أنشئ صفحة جديدة مثل: الشروط، الخصوصية، الأسئلة الشائعة</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPages.map((page) => (
            <div
              key={page.id}
              className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-[#f7f8f8] font-medium">{page.title}</p>
                    {page.is_published ? (
                      <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[#0ecb81]/10 text-[#0ecb81]">
                        <Globe className="h-2.5 w-2.5" /> منشور
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[#8a8f98]/10 text-[#8a8f98]">
                        <Lock className="h-2.5 w-2.5" /> مسودة
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-[#8a8f98] font-mono" dir="ltr">/{page.slug}</span>
                    <span className="text-[10px] text-[#8a8f98]">
                      آخر تعديل: {new Date(page.updated_at).toLocaleDateString('ar')}
                    </span>
                  </div>
                  {page.meta_description && (
                    <p className="text-[10px] text-[#8a8f98] mt-1 truncate">{page.meta_description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => togglePublish(page)}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] transition-colors"
                    title={page.is_published ? 'إلغاء النشر' : 'نشر'}
                  >
                    {page.is_published ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => startEdit(page)}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#0052ff] transition-colors"
                    title="تعديل"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  {page.is_published && (
                    <a
                      href={`/${page.slug}`}
                      target="_blank"
                      className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#0ecb81] transition-colors"
                      title="عرض"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Create Templates */}
      {pages.length === 0 && !loading && (
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#f7f8f8] mb-3">قوالب سريعة</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { title: 'شروط الاستخدام', slug: 'terms' },
              { title: 'سياسة الخصوصية', slug: 'privacy' },
              { title: 'الأسئلة الشائعة', slug: 'faq' },
              { title: 'عن المنصة', slug: 'about' },
            ].map((template) => (
              <button
                key={template.slug}
                onClick={() => {
                  setIsCreating(true);
                  setFormData({
                    title: template.title,
                    slug: template.slug,
                    content: `<h1>${template.title}</h1>\n<p>محتوى صفحة ${template.title} سيتم إضافته هنا...</p>`,
                    meta_description: `${template.title} - Sentinel`,
                    is_published: false,
                  });
                }}
                className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.02] hover:bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] text-xs transition-colors border border-white/5 hover:border-white/10"
              >
                <FileText className="h-4 w-4" />
                {template.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
