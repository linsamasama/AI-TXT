import React, { useState, useEffect } from "react";
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  Tag, 
  Input, 
  Select, 
  DatePicker, 
  Modal, 
  message, 
  Popconfirm,
  Tooltip,
  Typography,
  Row,
  Col,
  Statistic,
  Divider
} from "antd";
import { 
  DownloadOutlined, 
  DeleteOutlined, 
  EyeOutlined, 
  FilterOutlined,
  BookOutlined,
  FileTextOutlined,
  CalendarOutlined
} from "@ant-design/icons";
import { 
  getStories, 
  deleteStory, 
  downloadStories, 
  getStoriesByWordCount,
  getStoryStats
} from "../api";

const { Search } = Input;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

export default function StoryManager() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedStory, setSelectedStory] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [stats, setStats] = useState({});
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  
  // 筛选条件
  const [filters, setFilters] = useState({
    keyword: '',
    status: '',
    minWordCount: '',
    maxWordCount: '',
    dateRange: null
  });

  useEffect(() => {
    loadStories();
    loadStats();
  }, [pagination.current, pagination.pageSize, filters]);

  const loadStories = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.current,
        limit: pagination.pageSize,
        ...filters
      };
      
      // 处理日期范围
      if (filters.dateRange && filters.dateRange.length === 2) {
        params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      
      const response = await getStories(params);
      setStories(response.stories);
      setPagination(prev => ({
        ...prev,
        total: response.pagination.total
      }));
    } catch (error) {
      message.error('加载小说列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await getStoryStats();
      setStats(statsData);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  };

  const handleSearch = (value) => {
    setFilters(prev => ({ ...prev, keyword: value }));
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleFilter = () => {
    setFilterModalVisible(true);
  };

  const handleApplyFilter = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setFilterModalVisible(false);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleDelete = async (id) => {
    try {
      await deleteStory(id);
      message.success('删除成功');
      loadStories();
      loadStats();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的小说');
      return;
    }
    
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 部小说吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await Promise.all(selectedRowKeys.map(id => deleteStory(id)));
          message.success(`成功删除 ${selectedRowKeys.length} 部小说`);
          setSelectedRowKeys([]);
          loadStories();
          loadStats();
        } catch (error) {
          message.error('批量删除失败');
        }
      }
    });
  };

  const handleDownload = async (ids) => {
    try {
      await downloadStories({ ids, format: 'txt' });
      message.success('下载已开始');
    } catch (error) {
      message.error('下载失败');
    }
  };

  const handleBatchDownload = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要下载的小说');
      return;
    }
    handleDownload(selectedRowKeys);
  };

  const handleViewDetail = async (story) => {
    setSelectedStory(story);
    setDetailModalVisible(true);
  };

  const handleWordCountFilter = async () => {
    Modal.confirm({
      title: '按字数筛选',
      content: (
        <div>
          <p>选择字数范围进行筛选：</p>
          <Select
            defaultValue="1000-5000"
            style={{ width: '100%' }}
            onChange={(value) => {
              const [min, max] = value.split('-').map(Number);
              handleApplyFilter({ minWordCount: min, maxWordCount: max });
            }}
          >
            <Option value="0-1000">1000字以下</Option>
            <Option value="1000-5000">1000-5000字</Option>
            <Option value="5000-10000">5000-10000字</Option>
            <Option value="10000-20000">10000-20000字</Option>
            <Option value="20000-50000">20000-50000字</Option>
            <Option value="50000-999999">50000字以上</Option>
          </Select>
        </div>
      ),
      okButtonProps: { style: { display: 'none' } }
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'generating': return 'processing';
      case 'error': return 'error';
      case 'draft': return 'default';
      default: return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed': return '已完成';
      case 'generating': return '生成中';
      case 'error': return '失败';
      case 'draft': return '草稿';
      default: return '未知';
    }
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <Text strong>{text}</Text>
        </Tooltip>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {getStatusText(status)}
        </Tag>
      )
    },
    {
      title: '实际字数',
      dataIndex: 'actual_word_count',
      key: 'actual_word_count',
      width: 100,
      render: (count) => (
        <Text type={count > 0 ? 'success' : 'secondary'}>
          {count?.toLocaleString() || 0} 字
        </Text>
      ),
      sorter: (a, b) => a.actual_word_count - b.actual_word_count
    },
    {
      title: '目标字数',
      dataIndex: 'target_word_count',
      key: 'target_word_count',
      width: 100,
      render: (count) => (
        <Text type="secondary">
          {count?.toLocaleString() || 0} 字
        </Text>
      )
    },
    {
      title: 'AI模型',
      dataIndex: 'model',
      key: 'model',
      width: 150,
      ellipsis: true,
      render: (model) => (
        <Tooltip title={model}>
          <Text code>{model}</Text>
        </Tooltip>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date) => new Date(date).toLocaleString()
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 150,
      render: (date) => new Date(date).toLocaleString()
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
          <Tooltip title="下载">
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload([record.id])}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这部小说吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    getCheckboxProps: (record) => ({
      disabled: record.status === 'generating'
    })
  };

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: 'calc(100vh - 64px)' }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总小说数"
              value={stats.total_stories || 0}
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总字数"
              value={stats.total_words || 0}
              prefix={<FileTextOutlined />}
              formatter={(value) => `${(value || 0).toLocaleString()}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已完成"
              value={stats.completed_stories || 0}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均字数"
              value={Math.round(stats.avg_words || 0)}
              prefix={<FileTextOutlined />}
              formatter={(value) => `${(value || 0).toLocaleString()}`}
            />
          </Card>
        </Col>
      </Row>

      {/* 主内容区域 */}
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            小说管理
          </Title>
        </div>

        {/* 工具栏 */}
        <div style={{ marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Search
                placeholder="搜索小说标题或内容"
                allowClear
                enterButton="搜索"
                style={{ width: 300 }}
                onSearch={handleSearch}
              />
            </Col>
            <Col>
              <Space>
                <Button 
                  icon={<FilterOutlined />} 
                  onClick={handleWordCountFilter}
                >
                  按字数筛选
                </Button>
                <Button 
                  icon={<FilterOutlined />} 
                  onClick={handleFilter}
                >
                  高级筛选
                </Button>
                <Button 
                  type="primary" 
                  icon={<DownloadOutlined />}
                  disabled={selectedRowKeys.length === 0}
                  onClick={handleBatchDownload}
                >
                  批量下载 ({selectedRowKeys.length})
                </Button>
                <Button 
                  danger 
                  icon={<DeleteOutlined />}
                  disabled={selectedRowKeys.length === 0}
                  onClick={handleBatchDelete}
                >
                  批量删除 ({selectedRowKeys.length})
                </Button>
              </Space>
            </Col>
          </Row>
        </div>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={stories}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => {
              setPagination(prev => ({ ...prev, current: page, pageSize }));
            }
          }}
          rowSelection={rowSelection}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title={`小说详情 - ${selectedStory?.title}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          <Button 
            key="download" 
            type="primary" 
            icon={<DownloadOutlined />}
            onClick={() => selectedStory && handleDownload([selectedStory.id])}
          >
            下载
          </Button>
        ]}
        width={800}
      >
        {selectedStory && (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <p><strong>标题：</strong>{selectedStory.title}</p>
                <p><strong>状态：</strong>
                  <Tag color={getStatusColor(selectedStory.status)}>
                    {getStatusText(selectedStory.status)}
                  </Tag>
                </p>
                <p><strong>实际字数：</strong>{selectedStory.actual_word_count?.toLocaleString() || 0} 字</p>
                <p><strong>目标字数：</strong>{selectedStory.target_word_count?.toLocaleString() || 0} 字</p>
              </Col>
              <Col span={12}>
                <p><strong>AI模型：</strong>{selectedStory.model}</p>
                <p><strong>创建时间：</strong>{new Date(selectedStory.created_at).toLocaleString()}</p>
                <p><strong>更新时间：</strong>{new Date(selectedStory.updated_at).toLocaleString()}</p>
              </Col>
            </Row>
            
            <Divider />
            
            {selectedStory.instruction && (
              <div style={{ marginBottom: 16 }}>
                <h4>生成指令：</h4>
                <div style={{ 
                  background: '#f5f5f5', 
                  padding: 12, 
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap'
                }}>
                  {selectedStory.instruction}
                </div>
              </div>
            )}
            
            {selectedStory.outline && (
              <div style={{ marginBottom: 16 }}>
                <h4>大纲内容：</h4>
                <div style={{ 
                  background: '#f9f9f9', 
                  padding: 12, 
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 200,
                  overflow: 'auto'
                }}>
                  {selectedStory.outline}
                </div>
              </div>
            )}
            
            {selectedStory.content && (
              <div>
                <h4>小说正文：</h4>
                <div style={{ 
                  background: '#fafafa', 
                  padding: 12, 
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 400,
                  overflow: 'auto',
                  lineHeight: 1.7,
                  fontSize: 14
                }}>
                  {selectedStory.content}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 高级筛选弹窗 */}
      <Modal
        title="高级筛选"
        open={filterModalVisible}
        onOk={() => handleApplyFilter(filters)}
        onCancel={() => setFilterModalVisible(false)}
        okText="应用筛选"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>状态筛选：</label>
            <Select
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              style={{ width: '100%' }}
              placeholder="选择状态"
              allowClear
            >
              <Option value="">全部</Option>
              <Option value="completed">已完成</Option>
              <Option value="generating">生成中</Option>
              <Option value="draft">草稿</Option>
              <Option value="error">失败</Option>
            </Select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>字数范围：</label>
            <Row gutter={8}>
              <Col span={12}>
                <Input
                  placeholder="最小字数"
                  value={filters.minWordCount}
                  onChange={(e) => setFilters(prev => ({ ...prev, minWordCount: e.target.value }))}
                />
              </Col>
              <Col span={12}>
                <Input
                  placeholder="最大字数"
                  value={filters.maxWordCount}
                  onChange={(e) => setFilters(prev => ({ ...prev, maxWordCount: e.target.value }))}
                />
              </Col>
            </Row>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>创建时间：</label>
            <RangePicker
              value={filters.dateRange}
              onChange={(dates) => setFilters(prev => ({ ...prev, dateRange: dates }))}
              style={{ width: '100%' }}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}