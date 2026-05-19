import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import MeckyNotFound from '@/components/MeckyNotFound';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { usePostActions } from '@/hooks/usePostActions';
import {
  fetchPostById,
  fetchPostComments,
  createComment,
  deletePost,
  deleteComment,
  updateComment,
  getUserLikedPostIds,
} from '@/lib/supabase-posts';
import type { PostRecord, PostCommentRecord } from '@/lib/types/feed';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import { Image } from 'expo-image';
import PostImageGrid from '@/components/feed/PostImageGrid';
import PostVideoPlayer from '@/components/feed/PostVideoPlayer';
import ImageZoomModal from '@/components/ImageZoomModal';
import PostLinkPreview from '@/components/feed/PostLinkPreview';
import PostPollView from '@/components/feed/PostPollView';
import PostLinkedEventCard from '@/components/feed/PostLinkedEventCard';
import PostLinkedMarketplaceCard from '@/components/feed/PostLinkedMarketplaceCard';
import PostActions from '@/components/feed/PostActions';
import CommentItem from '@/components/feed/CommentItem';
import CommentInput from '@/components/feed/CommentInput';
import CommentScrim from '@/components/feed/CommentScrim';
import FeedPostSkeleton from '@/components/feed/FeedPostSkeleton';
import PostOptionsDrawer from '@/components/feed/PostOptionsDrawer';
import PostComposer from '@/components/feed/PostComposer';
import ReportDrawer from '@/components/feed/ReportDrawer';
import ConfirmationDrawer from '@/components/ConfirmationDrawer';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const { user } = useUser();
  const { activeAccount, isOwnerOf } = useAccount();
  const walletAddress = user?.wallet_address;
  const { showSnackbar } = useSnackbar();

  const [post, setPost] = useState<PostRecord | null>(null);
  const [comments, setComments] = useState<PostCommentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingComments, setIsRefreshingComments] = useState(false);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [commentPage, setCommentPage] = useState(0);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [reportDrawerVisible, setReportDrawerVisible] = useState(false);
  const [optionsDrawerVisible, setOptionsDrawerVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [editComposerVisible, setEditComposerVisible] = useState(false);
  const [editingComment, setEditingComment] = useState<PostCommentRecord | null>(null);
  const [deletingComment, setDeletingComment] = useState<PostCommentRecord | null>(null);
  const [deleteCommentConfirmVisible, setDeleteCommentConfirmVisible] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [commentFocused, setCommentFocused] = useState(false);

  const { isLiked, getLikeCount, toggleLike, sharePost, reportPost, initLikes } = usePostActions(walletAddress);

  const isOwnPost = !!walletAddress && !!post && (
    post.wallet_address?.toLowerCase() === walletAddress.toLowerCase() ||
    isOwnerOf(post.account_id ?? null)
  );

  // Load post + initial comments
  useEffect(() => {
    if (!id) return;
    loadPost();
  }, [id]);

  const loadPost = async () => {
    setIsLoading(true);
    const [postData, commentsData] = await Promise.all([
      fetchPostById(id!),
      fetchPostComments(id!, 0),
    ]);

    if (postData) {
      setPost(postData);

      // Init like state
      if (walletAddress) {
        const likedIds = await getUserLikedPostIds([postData.id], walletAddress);
        initLikes(likedIds, { [postData.id]: postData.likes_count });
      }
    }

    setComments(commentsData.data);
    setHasMoreComments(commentsData.hasMore);
    setIsLoading(false);
  };

  const loadMoreComments = useCallback(async () => {
    if (isLoadingMoreComments || !hasMoreComments) return;
    setIsLoadingMoreComments(true);

    const nextPage = commentPage + 1;
    const result = await fetchPostComments(id!, nextPage);
    setCommentPage(nextPage);
    setComments((prev) => [...prev, ...result.data]);
    setHasMoreComments(result.hasMore);
    setIsLoadingMoreComments(false);
  }, [id, commentPage, isLoadingMoreComments, hasMoreComments]);

  const handleSubmitComment = async (
    content: string,
    stickerRewardId: string | null,
    imageUrl: string | null,
  ) => {
    if (!walletAddress || !id) return;
    setIsSubmittingComment(true);

    try {
      const newComment = await createComment({
        post_id: id,
        wallet_address: walletAddress,
        account_id: activeAccount?.id,
        content,
        sticker_reward_id: stickerRewardId,
        media_urls: imageUrl ? [imageUrl] : undefined,
      });

      if (newComment) {
        setComments((prev) => [...prev, newComment]);
        // Update comment count on post
        setPost((prev) =>
          prev ? { ...prev, comments_count: prev.comments_count + 1 } : prev
        );
        Keyboard.dismiss();
        setCommentFocused(false);
      }
    } catch (err) {
      console.error('Error submitting comment:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const refreshComments = async () => {
    setIsRefreshingComments(true);
    setCommentPage(0);
    const result = await fetchPostComments(id!, 0);
    setComments(result.data);
    setHasMoreComments(result.hasMore);
    setIsRefreshingComments(false);
  };

  const handleSubmitReport = async (reason: string) => {
    if (!post) return;
    try {
      await reportPost(post.id, reason);
      showSnackbar({ message: 'Beitrag wurde gemeldet' });
    } catch {
      showSnackbar({ message: 'Fehler beim Melden des Beitrags' });
      throw new Error('Report failed');
    }
  };

  const handleEditPost = () => {
    setEditComposerVisible(true);
  };

  const handleDeletePost = () => {
    setDeleteConfirmVisible(true);
  };

  const confirmDeletePost = async () => {
    if (!post || !walletAddress) return;
    if (post.wallet_address?.toLowerCase() !== walletAddress.toLowerCase()) {
      showSnackbar({ message: 'Du kannst diesen Beitrag nicht löschen' });
      return;
    }
    try {
      await deletePost(post.id, walletAddress);
      showSnackbar({ message: 'Beitrag gelöscht' });
      router.back();
    } catch {
      showSnackbar({ message: 'Fehler beim Löschen des Beitrags' });
    }
  };

  const handlePostUpdated = (updatedPost: PostRecord) => {
    setPost(updatedPost);
    setEditComposerVisible(false);
    showSnackbar({ message: 'Beitrag aktualisiert' });
  };

  const handleEditComment = (comment: PostCommentRecord) => {
    setEditingComment(comment);
  };

  const handleDeleteComment = (comment: PostCommentRecord) => {
    setDeletingComment(comment);
    setDeleteCommentConfirmVisible(true);
  };

  const confirmDeleteComment = async () => {
    if (!deletingComment || !id || !walletAddress) return;
    if (deletingComment.wallet_address?.toLowerCase() !== walletAddress.toLowerCase()) {
      showSnackbar({ message: 'Du kannst diesen Kommentar nicht löschen' });
      setDeleteCommentConfirmVisible(false);
      return;
    }
    try {
      await deleteComment(deletingComment.id, id, walletAddress);
      setComments((prev) => prev.filter((c) => c.id !== deletingComment.id));
      setPost((prev) =>
        prev ? { ...prev, comments_count: Math.max(0, prev.comments_count - 1) } : prev
      );
      showSnackbar({ message: 'Kommentar gelöscht' });
    } catch {
      showSnackbar({ message: 'Fehler beim Löschen des Kommentars' });
    } finally {
      setDeleteCommentConfirmVisible(false);
      setDeletingComment(null);
    }
  };

  const handleSubmitEditComment = async (
    content: string,
    _stickerRewardId: string | null,
    _imageUrl: string | null,
  ) => {
    if (!editingComment) return;
    try {
      const updated = await updateComment(editingComment.id, content);
      if (updated) {
        setComments((prev) =>
          prev.map((c) => (c.id === editingComment.id ? updated : c))
        );
        showSnackbar({ message: 'Kommentar aktualisiert' });
      }
    } catch {
      showSnackbar({ message: 'Fehler beim Bearbeiten des Kommentars' });
    } finally {
      setEditingComment(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Beitrag</Text>
          <View style={styles.backButton} />
        </View>
        <FeedPostSkeleton />
        <FeedPostSkeleton />
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Beitrag</Text>
          <View style={styles.backButton} />
        </View>
        <MeckyNotFound title="Beitrag nicht gefunden" />
      </SafeAreaView>
    );
  }

  const mediaUrls = post.media_urls?.filter(Boolean) || [];
  const firstLink = post.links && post.links.length > 0 ? post.links[0] : null;

  const renderHeader = () => (
    <View style={[styles.postSection, { borderBottomColor: colors.border }]}>
      <PostAuthorRow
        author={post.author}
        category={post.category}
        createdAt={post.created_at}
        onMore={() => setOptionsDrawerVisible(true)}
      />

      <Text style={[styles.postContent, { color: colors.textPrimary }]}>{post.content}</Text>

      {post.linked_event && <PostLinkedEventCard event={post.linked_event} />}
      {post.linked_marketplace && <PostLinkedMarketplaceCard listing={post.linked_marketplace} />}

      {mediaUrls.length > 0 && (
        <PostImageGrid imageUrls={mediaUrls} onPress={(i) => setZoomImageUrl(mediaUrls[i])} />
      )}

      {post.video_url && (
        <PostVideoPlayer videoUrl={post.video_url} isVisible autoPlay />
      )}

      {post.sticker && (
        <Image
          source={{ uri: post.sticker.asset_url }}
          style={styles.postSticker}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
      )}

      {firstLink && <PostLinkPreview link={firstLink} />}

      {post.poll && <PostPollView poll={post.poll} walletAddress={walletAddress} />}

      <PostActions
        likesCount={getLikeCount(post.id, post.likes_count)}
        commentsCount={post.comments_count}
        isLiked={isLiked(post.id)}
        onLike={() => toggleLike(post.id, post.likes_count)}
        onComment={() => {}}
        onShare={() => sharePost(post.id, post.content)}
      />

      {/* Comments header */}
      <View style={styles.commentsHeader}>
        <Text style={[styles.commentsTitle, { color: colors.textPrimary }]}>
          Kommentare ({post.comments_count})
        </Text>
      </View>
    </View>
  );

  const renderComment = ({ item }: { item: PostCommentRecord }) => (
    <CommentItem
      comment={item}
      isOwner={!!walletAddress && item.wallet_address === walletAddress}
      onEdit={handleEditComment}
      onDelete={handleDeleteComment}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <View style={styles.flex}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable onPress={goBack} style={styles.backButton}>
              <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Beitrag</Text>
            <View style={styles.backButton} />
          </View>

          {/* Comments list with post as header */}
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={renderComment}
            ListHeaderComponent={renderHeader}
            onEndReached={hasMoreComments ? loadMoreComments : undefined}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshingComments}
                onRefresh={refreshComments}
                tintColor={colors.primary}
              />
            }
            ListFooterComponent={
              isLoadingMoreComments ? (
                <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
              ) : comments.length === 0 ? (
                <View style={styles.noComments}>
                  <Text style={[styles.noCommentsText, { color: colors.textTertiary }]}>
                    Noch keine Kommentare. Sei der Erste!
                  </Text>
                </View>
              ) : (
                <View style={styles.bottomPadding} />
              )
            }
          />
          <CommentScrim visible={commentFocused} />
        </View>

        {/* Comment input */}
        {walletAddress ? (
          <View style={styles.inputContainer}>
            {editingComment ? (
              <CommentInput
                onSubmit={handleSubmitEditComment}
                isSubmitting={false}
                initialValue={editingComment.content}
                onCancel={() => setEditingComment(null)}
                onFocusChange={setCommentFocused}
                walletAddress={walletAddress}
              />
            ) : (
              <CommentInput
                onSubmit={handleSubmitComment}
                isSubmitting={isSubmittingComment}
                onFocusChange={setCommentFocused}
                walletAddress={walletAddress}
              />
            )}
          </View>
        ) : (
          <Pressable
            onPress={() => router.push('/login')}
            style={[styles.loginPrompt, { backgroundColor: colors.background, borderTopColor: colors.border }]}
          >
            <Text style={[styles.loginPromptText, { color: colors.textTertiary }]}>
              Melde dich an, um zu kommentieren
            </Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>

      <PostOptionsDrawer
        visible={optionsDrawerVisible}
        onClose={() => setOptionsDrawerVisible(false)}
        isOwner={isOwnPost}
        onEdit={handleEditPost}
        onDelete={handleDeletePost}
        onReport={() => setReportDrawerVisible(true)}
      />

      <ReportDrawer
        visible={reportDrawerVisible}
        onClose={() => setReportDrawerVisible(false)}
        onReport={handleSubmitReport}
      />

      <ConfirmationDrawer
        visible={deleteConfirmVisible}
        title="Beitrag löschen?"
        message="Dieser Beitrag wird dauerhaft entfernt."
        variant="destructive"
        confirmText="Löschen"
        cancelText="Abbrechen"
        onConfirm={confirmDeletePost}
        onCancel={() => setDeleteConfirmVisible(false)}
      />

      <ConfirmationDrawer
        visible={deleteCommentConfirmVisible}
        title="Kommentar löschen?"
        message="Dieser Kommentar wird dauerhaft entfernt."
        variant="destructive"
        confirmText="Löschen"
        cancelText="Abbrechen"
        onConfirm={confirmDeleteComment}
        onCancel={() => { setDeleteCommentConfirmVisible(false); setDeletingComment(null); }}
      />

      {post && (
        <PostComposer
          visible={editComposerVisible}
          onClose={() => setEditComposerVisible(false)}
          onPostCreated={() => {}}
          feedType={post.feed_type}
          walletAddress={walletAddress || ''}
          isCitizen={false}
          user={user}
          editingPost={post}
          onPostUpdated={handlePostUpdated}
        />
      )}

      <ImageZoomModal
        visible={!!zoomImageUrl}
        imageUrl={zoomImageUrl || ''}
        onClose={() => setZoomImageUrl(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  postSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  postContent: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 24,
  },
  postSticker: {
    width: 200,
    height: 200,
    alignSelf: 'flex-start',
  },
  commentsHeader: {
    paddingTop: 14,
    paddingBottom: 4,
  },
  commentsTitle: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  noComments: {
    padding: 32,
    alignItems: 'center',
  },
  noCommentsText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  footerLoader: {
    padding: 20,
  },
  bottomPadding: {
    height: 20,
  },
  inputContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  loginPrompt: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  loginPromptText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
