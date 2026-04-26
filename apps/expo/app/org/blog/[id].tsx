import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import BlogComposer from '@/components/blog/BlogComposer';

export default function EditBlogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BlogComposer articleId={id} />;
}
